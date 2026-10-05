import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import * as EventService from "../services/event.service";
import { Event } from "../models/Event.model";
import User from "../models/User.model";
import FormModel from "../models/Form.model";
import FormSubmissionModel from "../models/FormSubmission.model";
import { Certificate } from "../models/Certificate.model";
import { Media } from "../models/Media.model";
import { uploadToCloudinary, deleteFromCloudinary } from "../services/upload.service";
import { sendEmail } from "../utils/sendEmail";
import { getGlobalEmailBranding } from "../utils/generateEmailTemplate";
import { createNotification, createBroadcastNotification } from "../services/notification.service";
import crypto from "crypto";
import AuditLog from "../models/AuditLog.model";

// ── Basic CRUD ─────────────────────────────────────────────────────────────

export const handleCreateEvent = async (req: Request, res: Response) => {
  try {
    if (!req.body.linkedForm || req.body.linkedForm === "" || !mongoose.Types.ObjectId.isValid(req.body.linkedForm)) {
      delete req.body.linkedForm;
    }

    const currentUser = (req as any).user;
    if (currentUser) {
      req.body.createdBy = currentUser._id;
      req.body.createdByName = currentUser.fullName || currentUser.name || "Staff Admin";
    }

    const event = await EventService.createEvent(req.body);

    // Write audit log entry
    if (currentUser) {
      AuditLog.create({
        actor: currentUser._id,
        actorName: currentUser.fullName || currentUser.name || "Staff Admin",
        actorEmail: currentUser.email,
        actorRole: currentUser.role || "admin",
        action: "CREATE",
        targetType: "EVENT",
        targetId: event._id.toString(),
        targetTitle: event.title,
        description: `${currentUser.fullName || "Admin"} created event "${event.title}" (${event.category}).`,
        diff: [
          { field: "Status", newValue: event.status },
          { field: "Is Published", newValue: event.isPublished ? "Yes" : "No" },
          { field: "Category", newValue: event.category },
        ],
      }).catch((logErr) => console.error("Event creation audit log error:", logErr));
    }

    // Two-way sync: If linkedForm was selected, link form to this event (it is no longer independent)
    if (event.linkedForm && mongoose.Types.ObjectId.isValid(event.linkedForm.toString())) {
      await FormModel.findByIdAndUpdate(event.linkedForm, { eventId: event._id });
    }

    // Broadcast in-app notification about new event ONLY if published (executives & current members only, excluding alumni/advisors)
    if (event.isPublished) {
      createBroadcastNotification({
        recipientRole: "current_members",
        type: "event",
        title: `New Event: ${event.title}`,
        message: event.description
          ? `${event.description.slice(0, 100)}...`
          : `MEC Computer Club has published a new event: ${event.title}`,
        link: `/events/${event.slug || event._id}`,
        actionLabel: "View Event",
        priority: "normal",
        metadata: { eventId: event._id },
      }).catch((err) => console.error("Event notification error:", err));

      await Event.findByIdAndUpdate(event._id, { notificationSent: true });
    }

    res.status(201).json({ success: true, data: event });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const handleGetEvents = async (req: Request, res: Response) => {
  try {
    const { category, status, sort } = req.query;
    const filter: any = {};
    if (category) filter.category = category;
    if (status) filter.status = status;
    const sortOption = sort === "asc" ? { date: 1 } : { date: -1 };
    const events = await EventService.getAllEvents(filter, sortOption);

    // Collect event IDs and form IDs
    const eventIds = events.map((e) => e._id);
    const formIdToEventMap: Record<string, string> = {};
    const allFormIdSet = new Set<string>();

    for (const ev of events) {
      const evIdStr = ev._id.toString();
      // 1. linkedForm
      const formRef: any = ev.linkedForm;
      const formIdStr = formRef?._id ? formRef._id.toString() : formRef?.toString();
      if (formIdStr && mongoose.Types.ObjectId.isValid(formIdStr)) {
        allFormIdSet.add(formIdStr);
        formIdToEventMap[formIdStr] = evIdStr;
      }
      // 2. forms array
      if (Array.isArray(ev.forms)) {
        for (const f of ev.forms) {
          const fid = f?._id ? f._id.toString() : f?.toString();
          if (fid && mongoose.Types.ObjectId.isValid(fid)) {
            allFormIdSet.add(fid);
            formIdToEventMap[fid] = evIdStr;
          }
        }
      }
    }

    // 3. Also check forms that have eventId matching any of our events
    const matchingForms = await FormModel.find({ eventId: { $in: eventIds } }).select("_id eventId").lean();
    for (const mf of matchingForms) {
      const fid = mf._id.toString();
      const eid = mf.eventId ? mf.eventId.toString() : "";
      if (eid) {
        allFormIdSet.add(fid);
        formIdToEventMap[fid] = eid;
      }
    }

    const formSubmissionCounts: Record<string, number> = {};
    if (allFormIdSet.size > 0) {
      const formObjectIds = Array.from(allFormIdSet).map((id) => new mongoose.Types.ObjectId(id));
      const submissionCounts = await FormSubmissionModel.aggregate([
        { $match: { formId: { $in: formObjectIds } } },
        { $group: { _id: "$formId", count: { $sum: 1 } } },
      ]);
      for (const item of submissionCounts) {
        formSubmissionCounts[item._id.toString()] = item.count;
      }
    }

    const eventsWithCount = events.map((eventDoc: any) => {
      const ev = eventDoc.toObject ? eventDoc.toObject() : { ...eventDoc };
      const evIdStr = ev._id.toString();

      // Sum all submissions for any forms associated with this event
      let totalFormSubs = 0;
      for (const [fid, eid] of Object.entries(formIdToEventMap)) {
        if (eid === evIdStr) {
          totalFormSubs += formSubmissionCounts[fid] || 0;
        }
      }

      const approvedCount = Array.isArray(ev.approvedParticipants) ? ev.approvedParticipants.length : 0;
      const pendingCount = Array.isArray(ev.pendingParticipants) ? ev.pendingParticipants.length : 0;
      const attendeesCount = Array.isArray(ev.attendees) ? ev.attendees.length : 0;

      const directCount = approvedCount + pendingCount;
      ev.registeredCount = totalFormSubs > 0 ? totalFormSubs : (directCount > 0 ? directCount : attendeesCount);
      ev.approvedCount = Math.max(approvedCount, attendeesCount);
      ev.pendingCount = pendingCount;
      return ev;
    });

    res.status(200).json({ success: true, count: eventsWithCount.length, data: eventsWithCount });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyEvents = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await User.findById(userId).select("eventsAttended studentId email").lean();
    const userAttendedIds = (user?.eventsAttended || []).map((id: any) => id.toString());

    const orConditions: any[] = [
      { attendees: userId },
      { "approvedParticipants.userId": userId },
      { "pendingParticipants.userId": userId },
      { "winners.members": userId },
    ];

    if (userAttendedIds.length > 0) {
      orConditions.push({ _id: { $in: userAttendedIds } });
    }

    if (user?.studentId) {
      orConditions.push({ "approvedParticipants.studentId": user.studentId });
      orConditions.push({ "pendingParticipants.leaderStudentId": user.studentId });
      orConditions.push({ "pendingParticipants.members.studentId": user.studentId });
    }

    const events = await Event.find({ $or: orConditions })
      .populate("attendees", "fullName email imageUrl studentId department")
      .populate("media")
      .sort({ date: -1 })
      .lean();

    res.status(200).json({ success: true, count: events.length, data: events });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const handleGetEventById = async (req: Request, res: Response) => {
  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
    const query = isObjectId
      ? { $or: [{ _id: req.params.id }, { slug: req.params.id }] }
      : { slug: req.params.id };

    const event = await Event.findOne(query)
      .populate("attendees", "fullName email imageUrl studentId department batch")
      .populate({
        path: "pendingParticipants.userId",
        select: "fullName email imageUrl studentId department",
        options: { strictPopulate: false },
      })
      .populate({
        path: "winners.members",
        select: "fullName email imageUrl studentId",
        options: { strictPopulate: false },
      })
      .populate("media")
      .populate("certificates")
      .populate({
        path: "participationClaims.userId",
        select: "fullName email imageUrl studentId department batch",
        options: { strictPopulate: false },
      })
      .populate({
        path: "participationClaims.reviewedBy",
        select: "fullName email",
        options: { strictPopulate: false },
      })
      .populate({
        path: "eventSponsors.sponsorId",
        select: "name logoUrl website",
        options: { strictPopulate: false },
      })
      .populate({
        path: "contributors.userId",
        select: "fullName email imageUrl studentId department batch",
        options: { strictPopulate: false },
      });

    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    // Normalise — ensure arrays exist even on old documents
    const data: any = event.toObject({ virtuals: true });
    data.pendingParticipants = data.pendingParticipants || [];
    data.participationClaims = data.participationClaims || [];
    data.contributors = data.contributors || [];
    data.winners = data.winners || [];
    data.eventSponsors = data.eventSponsors || [];
    data.media = data.media || [];
    data.certificates = data.certificates || [];
    data.attendees = data.attendees || [];
    data.tags = data.tags || [];
    data.rewards = data.rewards || [];
    data.schedule = data.schedule || [];
    data.rules = data.rules || [];

    // Calculate registeredCount from linked form submissions or participants
    let formSubs = 0;
    const associatedFormIds = new Set<string>();
    const formRef: any = event.linkedForm;
    const formIdStr = formRef?._id ? formRef._id.toString() : formRef?.toString();
    if (formIdStr && mongoose.Types.ObjectId.isValid(formIdStr)) {
      associatedFormIds.add(formIdStr);
    }
    if (Array.isArray(event.forms)) {
      for (const f of event.forms) {
        const fid = f?._id ? f._id.toString() : f?.toString();
        if (fid && mongoose.Types.ObjectId.isValid(fid)) associatedFormIds.add(fid);
      }
    }
    const formsWithEventId = await FormModel.find({ eventId: event._id }).select("_id").lean();
    for (const mf of formsWithEventId) {
      associatedFormIds.add(mf._id.toString());
    }

    if (!data.linkedForm && formsWithEventId.length > 0) {
      data.linkedForm = formsWithEventId[0]._id.toString();
    } else if (event.linkedForm) {
      data.linkedForm = (event.linkedForm as any)._id ? (event.linkedForm as any)._id.toString() : event.linkedForm.toString();
    }

    let formPendingCount = 0;
    if (associatedFormIds.size > 0) {
      const formIds = Array.from(associatedFormIds).map((id) => new mongoose.Types.ObjectId(id));
      const subs = await FormSubmissionModel.find({ formId: { $in: formIds } }).lean();
      formSubs = subs.length;
      const approvedEmails = new Set(
        (data.approvedParticipants || []).map((p: any) => (p.email || "").toLowerCase()).filter(Boolean)
      );
      subs.forEach((s: any) => {
        const details = extractApplicantDetails(s.responses);
        const email = (details.email || "").toLowerCase();
        const isApproved = s.status === "approved" || (email && approvedEmails.has(email));
        const isRejected = s.status === "rejected";
        if (!isApproved && !isRejected) {
          formPendingCount++;
        }
      });
    }

    const approvedCount = Array.isArray(data.approvedParticipants) ? data.approvedParticipants.length : 0;
    const attendeesCount = Array.isArray(data.attendees) ? data.attendees.length : 0;
    data.approvedCount = Math.max(approvedCount, attendeesCount);
    data.pendingCount = formPendingCount;
    data.registeredCount = formSubs > 0 ? formSubs : Math.max(approvedCount, attendeesCount);
    data.pendingParticipants = [];

    // Purge legacy pendingParticipants from database if present so old stale records never linger
    if (Array.isArray(event.pendingParticipants) && event.pendingParticipants.length > 0) {
      Event.findByIdAndUpdate(event._id, { $set: { pendingParticipants: [] } }).catch(() => {});
    }

    // Dynamically sync registration deadline from linked form if present
    let linkedFormDoc: any = null;
    if (formIdStr && mongoose.Types.ObjectId.isValid(formIdStr)) {
      linkedFormDoc = await FormModel.findById(formIdStr)
        .select("code title endDate closingTime isClosed acceptingResponses")
        .lean();
    } else if (formsWithEventId.length > 0) {
      linkedFormDoc = await FormModel.findById(formsWithEventId[0]._id)
        .select("code title endDate closingTime isClosed acceptingResponses")
        .lean();
    }

    if (linkedFormDoc) {
      if (linkedFormDoc.endDate) {
        const time = linkedFormDoc.closingTime || "23:59";
        const parts = linkedFormDoc.endDate.split("-");
        if (parts.length === 3) {
          const bstIso = new Date(
            `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}T${
              time.length === 5 ? time + ":00" : time
            }+06:00`
          ).toISOString();
          data.registrationDeadline = bstIso;
        }
      }
      data.linkedForm = linkedFormDoc.code || linkedFormDoc._id.toString();
      data.isFormClosed = Boolean(linkedFormDoc.isClosed || linkedFormDoc.acceptingResponses === false);
    }

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error("handleGetEventById error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const handleUpdateEvent = async (req: Request, res: Response) => {
  try {
    const existingEvent = await Event.findById(req.params.id);
    if (!existingEvent) return res.status(404).json({ success: false, message: "Event not found" });

    const oldFormId = existingEvent.linkedForm ? existingEvent.linkedForm.toString() : null;

    let updateData = { ...req.body };
    let shouldUnsetLinkedForm = false;

    if ("linkedForm" in updateData) {
      if (!updateData.linkedForm || updateData.linkedForm === "" || !mongoose.Types.ObjectId.isValid(updateData.linkedForm)) {
        shouldUnsetLinkedForm = true;
        delete updateData.linkedForm;
      }
    }

    let updatedEvent;
    if (shouldUnsetLinkedForm) {
      updatedEvent = await Event.findByIdAndUpdate(
        req.params.id,
        { ...updateData, $unset: { linkedForm: 1 } },
        { new: true, runValidators: true }
      );
    } else {
      updatedEvent = await EventService.updateEvent(req.params.id, updateData);
    }

    if (!updatedEvent) return res.status(404).json({ success: false, message: "Event not found" });

    const newFormId = updatedEvent.linkedForm ? updatedEvent.linkedForm.toString() : null;

    // Two-way sync: If linkedForm changed
    if (oldFormId && oldFormId !== newFormId) {
      // Unlink previous form -> make it independent again
      await FormModel.findByIdAndUpdate(oldFormId, { $unset: { eventId: 1 } });
    }
    if (newFormId && oldFormId !== newFormId) {
      // Link new form to this event
      await FormModel.findByIdAndUpdate(newFormId, { eventId: updatedEvent._id });
    }

    // Broadcast notification ONLY if an unpublished draft is being published for the very first time.
    // NEVER dispatch notifications for status changes (e.g. upcoming -> completed) or editing already-published events.
    const wasPublished = Boolean(existingEvent.isPublished);
    const isNowPublished = Boolean(updatedEvent.isPublished);
    const alreadyNotified = Boolean(existingEvent.notificationSent);
    const isFirstTimePublishing = !wasPublished && isNowPublished && !alreadyNotified && req.body.isPublished === true;

    if (isFirstTimePublishing) {
      createBroadcastNotification({
        recipientRole: "current_members",
        type: "event",
        title: `New Event: ${updatedEvent.title}`,
        message: updatedEvent.description
          ? `${updatedEvent.description.slice(0, 100)}...`
          : `MEC Computer Club has published a new event: ${updatedEvent.title}`,
        link: `/events/${updatedEvent.slug || updatedEvent._id}`,
        actionLabel: "View Event",
        priority: "normal",
        metadata: { eventId: updatedEvent._id },
      }).catch((err) => console.error("Event update notification error:", err));

      await Event.findByIdAndUpdate(updatedEvent._id, { notificationSent: true });
    }

    res.status(200).json({ success: true, data: updatedEvent });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const handleDeleteEvent = async (req: Request, res: Response) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    // Two-way sync: If event had a linkedForm, release the form so it becomes independent again
    if (event.linkedForm) {
      await FormModel.findByIdAndUpdate(event.linkedForm, { $unset: { eventId: 1 } });
    }

    const deletedEvent = await EventService.deleteEvent(req.params.id);
    res.status(200).json({ success: true, message: "Event deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Participant Management ─────────────────────────────────────────────────

/**
 * @desc  Add participant / team to pending list
 * @route POST /api/events/:id/participants/register
 */
export const registerParticipant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      userId,
      teamName,
      leaderName,
      leaderEmail,
      leaderPhone,
      leaderStudentId,
      inGameId,
      members,
      formData,
    } = req.body;

    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    // Check registration deadline
    if (event.registrationDeadline && new Date() > new Date(event.registrationDeadline)) {
      return res.status(400).json({
        success: false,
        message: "Registration for this event is closed as the deadline has passed.",
      });
    }

    // Check participant capacity
    const totalCurrent = (event.attendees?.length || 0) + (event.pendingParticipants?.length || 0);
    if (event.maxParticipants && totalCurrent >= event.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: "Registration limit reached. This event is fully booked.",
      });
    }

    // Team registration validation
    if (event.registrationType === "team" || teamName) {
      const cleanTeamName = (teamName || "").trim();
      if (!cleanTeamName) {
        return res.status(400).json({ success: false, message: "Team name is required for team events." });
      }

      const duplicate = event.pendingParticipants.some(
        (p) => p.teamName && p.teamName.toLowerCase() === cleanTeamName.toLowerCase()
      );
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Team "${cleanTeamName}" has already been submitted for this event.`,
        });
      }

      event.pendingParticipants.push({
        userId: userId && mongoose.Types.ObjectId.isValid(userId) ? userId : undefined,
        teamName: cleanTeamName,
        leaderName: (leaderName || "").trim(),
        leaderEmail: (leaderEmail || "").trim(),
        leaderPhone: (leaderPhone || "").trim(),
        leaderStudentId: (leaderStudentId || "").trim(),
        inGameId: (inGameId || "").trim(),
        members: Array.isArray(members) ? members : [],
        registeredAt: new Date(),
        formData: formData || req.body,
      });

      await event.save();

      return res.status(200).json({
        success: true,
        message: `Team "${cleanTeamName}" registration submitted successfully! Pending admin confirmation.`,
      });
    }

    // Individual registration validation
    const resolvedUserId = userId || (req as any).user?.id;
    const registrantEmail = leaderEmail || (req as any).user?.email;

    if (resolvedUserId) {
      const alreadyAttendee = event.attendees.some((id) => id.toString() === resolvedUserId.toString());
      const alreadyPending = event.pendingParticipants.some(
        (p) => p.userId && p.userId.toString() === resolvedUserId.toString()
      );
      if (alreadyAttendee || alreadyPending) {
        return res.status(400).json({ success: false, message: "You are already registered or pending approval." });
      }
    }

    event.pendingParticipants.push({
      userId: resolvedUserId && mongoose.Types.ObjectId.isValid(resolvedUserId) ? resolvedUserId : undefined,
      leaderName: (leaderName || "").trim(),
      leaderEmail: (registrantEmail || "").trim(),
      leaderPhone: (leaderPhone || "").trim(),
      leaderStudentId: (leaderStudentId || "").trim(),
      inGameId: (inGameId || "").trim(),
      registeredAt: new Date(),
      formData: formData || req.body,
    });

    await event.save();

    res.status(200).json({
      success: true,
      message: "Registration submitted successfully! You will receive an email once approved.",
    });
  } catch (error) { next(error); }
};

/**
 * @desc  Approve a pending participant / team → moves to attendees & sends confirmation email
 * @route PATCH /api/events/:id/participants/:userId/approve
 */
export const approveParticipant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: eventId, userId: targetId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    // Match either pending participant _id OR userId
    const pendingIdx = event.pendingParticipants.findIndex(
      (p: any) => p._id?.toString() === targetId || p.userId?.toString() === targetId
    );
    if (pendingIdx === -1) {
      return res.status(404).json({ success: false, message: "Pending registration not found." });
    }

    const participant = event.pendingParticipants[pendingIdx];

    // Remove from pending
    event.pendingParticipants.splice(pendingIdx, 1);

    // Save to approvedParticipants array (preserves non-members, captains, and squad rosters)
    if (participant.teamName || (participant.members && participant.members.length > 0)) {
      // Add team leader
      event.approvedParticipants.push({
        userId: participant.userId,
        fullName: participant.leaderName || participant.teamName || "Team Captain",
        email: participant.leaderEmail || "",
        studentId: participant.leaderStudentId || "",
        phone: participant.leaderPhone || "",
        teamName: participant.teamName,
        inGameId: participant.inGameId,
        isTeamLeader: true,
        approvedAt: new Date(),
      });

      // Add squad members
      if (Array.isArray(participant.members)) {
        for (const m of participant.members) {
          event.approvedParticipants.push({
            fullName: m.fullName,
            email: m.email || "",
            studentId: m.studentId || "",
            department: m.department || "",
            phone: m.phone || "",
            teamName: participant.teamName,
            inGameId: m.inGameId,
            isTeamLeader: false,
            approvedAt: new Date(),
          });
        }
      }
    } else {
      // Individual participant
      let resolvedName = participant.leaderName;
      let resolvedEmail = participant.leaderEmail;
      let resolvedStudentId = participant.leaderStudentId;
      let resolvedDept = "";
      let resolvedPhone = participant.leaderPhone;

      if (participant.userId && (!resolvedName || !resolvedEmail)) {
        const u = await User.findById(participant.userId).select("fullName email studentId department phone");
        if (u) {
          resolvedName = resolvedName || u.fullName;
          resolvedEmail = resolvedEmail || u.email;
          resolvedStudentId = resolvedStudentId || u.studentId;
          resolvedDept = u.department || "";
          resolvedPhone = resolvedPhone || (u as any).phone;
        }
      }

      event.approvedParticipants.push({
        userId: participant.userId,
        fullName: resolvedName || "Participant",
        email: resolvedEmail || "",
        studentId: resolvedStudentId || "",
        department: resolvedDept,
        phone: resolvedPhone || "",
        teamName: participant.teamName,
        inGameId: participant.inGameId,
        isTeamLeader: false,
        approvedAt: new Date(),
      });
    }

    // If there is an associated User document, link to attendees
    if (participant.userId) {
      if (!event.attendees.some((id) => id.toString() === participant.userId?.toString())) {
        event.attendees.push(participant.userId as any);
      }
      await User.findByIdAndUpdate(participant.userId, {
        $addToSet: { eventsAttended: eventId },
      });

      // Dispatch in-app notification to attendee
      createNotification({
        recipient: participant.userId,
        type: "event",
        title: "Registration Approved! 🎟️",
        message: `Your registration for "${event.title}" has been confirmed. See you at the event!`,
        link: `/events/${event.slug || event._id}`,
        actionLabel: "View Event",
        priority: "normal",
        metadata: { eventId: event._id },
      }).catch((err) => console.error("Participant notification error:", err));
    }

    await event.save();

    const recipientName = participant.leaderName || participant.teamName;

    res.status(200).json({
      success: true,
      message: `Registration approved for ${recipientName || "participant"}. Notification dispatched.`,
    });
  } catch (error) { next(error); }
};

/**
 * @desc  Reject a participant (pending or previously approved)
 * @route PATCH /api/events/:id/participants/:userId/reject
 */
export const rejectParticipant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: eventId, userId: targetId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    // Remove from pendingParticipants
    event.pendingParticipants = (event.pendingParticipants || []).filter(
      (p: any) => p._id?.toString() !== targetId && p.userId?.toString() !== targetId
    ) as any;

    // Remove from approvedParticipants if previously approved
    event.approvedParticipants = (event.approvedParticipants || []).filter(
      (p: any) => p._id?.toString() !== targetId && p.userId?.toString() !== targetId
    ) as any;

    // Remove from attendees and user activity if linked
    event.attendees = (event.attendees || []).filter(
      (a: any) => a.toString() !== targetId
    ) as any;
    await User.findByIdAndUpdate(targetId, {
      $pull: { eventsAttended: event._id },
    });

    await event.save();

    res.status(200).json({ success: true, message: "Participant registration rejected." });
  } catch (error) { next(error); }
};

/**
 * @desc  Directly add an approved attendee (for past events / manual entry)
 * @route POST /api/events/:id/participants/add
 */
export const addAttendee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userIds, nonMembers } = req.body;
    if ((!Array.isArray(userIds) || userIds.length === 0) && (!Array.isArray(nonMembers) || nonMembers.length === 0)) {
      return res.status(400).json({ success: false, message: "userIds or nonMembers array is required" });
    }

    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    if (Array.isArray(userIds)) {
      for (const userId of userIds) {
        if (!event.attendees.some((id) => id.toString() === userId)) {
          event.attendees.push(userId);
        }
        const u = await User.findById(userId).select("fullName email studentId department phone");
        if (u && !event.approvedParticipants.some((ap) => ap.userId?.toString() === userId)) {
          event.approvedParticipants.push({
            userId: u._id,
            fullName: u.fullName,
            email: u.email,
            studentId: u.studentId,
            department: u.department,
            phone: (u as any).phone,
            approvedAt: new Date(),
          });
        }
        // Update user profile
        await User.findByIdAndUpdate(userId, { $addToSet: { eventsAttended: req.params.id } });
      }
    }

    if (Array.isArray(nonMembers)) {
      for (const nm of nonMembers) {
        if (nm && nm.fullName && nm.email) {
          event.approvedParticipants.push({
            fullName: nm.fullName.trim(),
            email: nm.email.trim(),
            studentId: nm.studentId?.trim(),
            department: nm.department?.trim(),
            phone: nm.phone?.trim(),
            approvedAt: new Date(),
          });
        }
      }
    }

    await event.save();

    res.status(200).json({ success: true, message: "Attendee(s) added successfully." });
  } catch (error) { next(error); }
};

/**
 * @desc  Remove an attendee
 * @route DELETE /api/events/:id/participants/:userId
 */
export const removeAttendee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: eventId, userId } = req.params;

    await Event.findByIdAndUpdate(eventId, {
      $pull: {
        attendees: userId,
        approvedParticipants: {
          $or: [
            { userId: mongoose.Types.ObjectId.isValid(userId) ? userId : undefined },
            { _id: mongoose.Types.ObjectId.isValid(userId) ? userId : undefined },
          ],
        },
      },
    });
    if (mongoose.Types.ObjectId.isValid(userId)) {
      await User.findByIdAndUpdate(userId, { $pull: { eventsAttended: eventId } });
    }

    res.status(200).json({ success: true, message: "Attendee removed." });
  } catch (error) { next(error); }
};

// ── Winners ────────────────────────────────────────────────────────────────

/**
 * @desc  Set/update winners for an event
 * @route PUT /api/events/:id/winners
 */
export const setWinners = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { winners } = req.body; // [{ teamName?, members: [userId], position, prize? }]
    if (!Array.isArray(winners)) {
      return res.status(400).json({ success: false, message: "winners array is required" });
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { $set: { winners } },
      { new: true }
    ).populate("winners.members", "fullName email imageUrl");

    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    res.status(200).json({ success: true, data: event.winners });
  } catch (error) { next(error); }
};

// ── Contributors (Organizers & Volunteers) ───────────────────────────────────

/**
 * @desc  Set/update organizing team and volunteers for an event
 * @route PUT /api/events/:id/contributors
 */
export const setContributors = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contributors } = req.body;
    if (!Array.isArray(contributors)) {
      return res.status(400).json({ success: false, message: "contributors array is required" });
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { $set: { contributors } },
      { new: true }
    ).populate({
      path: "contributors.userId",
      select: "fullName email imageUrl studentId department batch",
      options: { strictPopulate: false },
    });

    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    res.status(200).json({ success: true, data: event.contributors });
  } catch (error) { next(error); }
};

// ── Sponsors ───────────────────────────────────────────────────────────────

/**
 * @desc  Add a sponsor to an event
 * @route POST /api/events/:id/sponsors
 */
export const addEventSponsor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sponsorId, sponsorName, logoUrl, tier } = req.body;
    if (!sponsorId || !sponsorName) {
      return res.status(400).json({ success: false, message: "sponsorId and sponsorName are required" });
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { $push: { eventSponsors: { sponsorId, sponsorName, logoUrl, tier } } },
      { new: true }
    );
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    res.status(200).json({ success: true, data: event.eventSponsors });
  } catch (error) { next(error); }
};

/**
 * @desc  Remove a sponsor from an event
 * @route DELETE /api/events/:id/sponsors/:sponsorId
 */
export const removeEventSponsor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { $pull: { eventSponsors: { sponsorId: req.params.sponsorId } } },
      { new: true }
    );
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    res.status(200).json({ success: true, data: event.eventSponsors });
  } catch (error) { next(error); }
};

// ── Media ──────────────────────────────────────────────────────────────────

/**
 * @desc  Upload media (image/video) for an event
 * @route POST /api/events/:id/media
 */
export const uploadEventMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, mediaType, url, fileSize, publicId } = req.body;
    const uploaderId = (req as any).user?.id;

    let mediaUrl = url;
    let cloudinaryPublicId: string = publicId || "";

    // If a file was sent directly (multipart), upload it
    if (req.file) {
      const result = await uploadToCloudinary(req.file);
      mediaUrl = result.url;
      cloudinaryPublicId = result.public_id;
    }

    if (!mediaUrl) {
      return res.status(400).json({ success: false, message: "Media URL or file is required" });
    }

    const media = await Media.create({
      title: title || "Event Media",
      url: mediaUrl,
      mediaType: mediaType || (req.file?.mimetype?.startsWith("video") ? "video" : "image"),
      fileSize: fileSize || req.file?.size || 0,
      uploader: uploaderId,
      relatedEvent: req.params.id,
      tags: [],
      imagePublicId: cloudinaryPublicId || null,
    });

    await Event.findByIdAndUpdate(req.params.id, { $push: { media: media._id } });

    res.status(201).json({ success: true, data: media });
  } catch (error) { next(error); }
};

export const removeEventMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Unlink from event
    await Event.findByIdAndUpdate(req.params.id, { $pull: { media: req.params.mediaId } });

    // 2. Find the media document to get the Cloudinary public_id
    const mediaDoc = await Media.findById(req.params.mediaId).lean() as any;

    // 3. Delete from Cloudinary if it was uploaded there (has a public_id)
    if (mediaDoc?.imagePublicId) {
      try {
        await deleteFromCloudinary(mediaDoc.imagePublicId);
      } catch (cloudErr) {
        console.error("Cloudinary deletion failed for media:", mediaDoc.imagePublicId, cloudErr);
      }
    }

    // 4. Delete the Media document
    await Media.findByIdAndDelete(req.params.mediaId);

    res.status(200).json({ success: true, message: "Media removed." });
  } catch (error) { next(error); }
};

/**
 * @desc  Get all event media items for the public gallery
 * @route GET /api/events/media/gallery
 */
export const getGalleryMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, eventId } = req.query;
    const filter: any = {};
    if (type && type !== "all") {
      filter.mediaType = type;
    }
    if (eventId) {
      filter.relatedEvent = eventId;
    }

    const page = parseInt(String(req.query.page || "1"), 10);
    const limit = parseInt(String(req.query.limit || "0"), 10);

    let query = Media.find(filter)
      .populate("relatedEvent", "title slug date category location")
      .sort({ createdAt: -1 });

    if (limit > 0) {
      query = query.skip((Math.max(1, page) - 1) * limit).limit(limit);
    }

    const mediaList = await query.lean();

    res.status(200).json({ success: true, count: mediaList.length, data: mediaList });
  } catch (error) {
    next(error);
  }
};


// ── Certificates ───────────────────────────────────────────────────────────

/**
 * @desc  Issue certificates to event participants (bulk or individual)
 * @route POST /api/events/:id/certificates
 * Body: { recipients: [{ userId, type, position?, digitalUrl }], name, description, issueDate }
 */
export const issueCertificates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { recipients, name, description, issueDate, digitalUrl, templateId, template } = req.body;
    const adminId = (req as any).user?.id;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ success: false, message: "recipients array is required" });
    }

    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    const finalTemplateId = templateId || template;
    const created: any[] = [];

    for (const r of recipients) {
      // Generate unique certificate ID
      const certId = `MCC-${new Date(issueDate || Date.now()).getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

      const isUserIdValid = r.userId && mongoose.Types.ObjectId.isValid(r.userId);

      const cert = await Certificate.create({
        name: name || `${event.title} Certificate`,
        description: description || `Awarded for participation in ${event.title}`,
        recipient: isUserIdValid ? r.userId : undefined,
        recipientName: r.fullName || r.name,
        recipientEmail: r.email,
        recipientStudentId: r.studentId,
        recipientDepartment: r.department,
        associatedEvent: req.params.id,
        template: finalTemplateId || undefined,
        issueDate: issueDate ? new Date(issueDate) : new Date(),
        certificateId: certId,
        digitalUrl: r.digitalUrl || digitalUrl || `/verify?cert=${certId}`,
        type: r.type || "participation",
        position: r.position,
        issuedBy: adminId,
        status: "valid",
      });

      // Link certificate to event
      await Event.findByIdAndUpdate(req.params.id, { $addToSet: { certificates: cert._id } });

      // Link certificate to user profile if member
      if (isUserIdValid) {
        await User.findByIdAndUpdate(r.userId, { $addToSet: { certificates: cert._id } });
      }

      created.push(cert);
    }

    res.status(201).json({
      success: true,
      message: `${created.length} certificate(s) issued.`,
      data: created,
    });
  } catch (error) { next(error); }
};

/**
 * @desc  Get all certificates for an event
 * @route GET /api/events/:id/certificates
 */
export const getEventCertificates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const certs = await Certificate.find({ associatedEvent: req.params.id })
      .populate("recipient", "fullName email imageUrl imagePosition studentId department batch session")
      .populate("template")
      .sort({ createdAt: -1 })
      .lean();

    const mapped = certs.map((c: any) => ({
      ...c,
      recipient: c.recipient || {
        fullName: c.recipientName || "Participant",
        email: c.recipientEmail || "",
        studentId: c.recipientStudentId || "",
        department: c.recipientDepartment || "",
      },
    }));

    res.status(200).json({ success: true, data: mapped });
  } catch (error) { next(error); }
};

// ── Participation Claims (Archived / Past Events) ───────────────────────────

/**
 * @desc  Submit participation claim for a past event
 * @route POST /api/events/:id/claim-participation
 */
export const claimParticipation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: eventId } = req.params;
    const { fullName, email, studentId, department, phone, role, notes } = req.body;

    const claimFullName = (fullName || (req as any).user?.fullName || "").trim();
    const claimEmail = (email || (req as any).user?.email || "").trim().toLowerCase();

    if (!claimFullName || !claimEmail) {
      return res.status(400).json({
        success: false,
        message: "Full Name and Email Address are required to submit a participation claim.",
      });
    }

    let userId = (req as any).user?._id || (req as any).user?.id;
    // If not logged in, check if user with this email exists in DB
    if (!userId && claimEmail) {
      const existingUser = await User.findOne({ email: claimEmail }).select("_id fullName studentId department phone");
      if (existingUser) {
        userId = existingUser._id;
      }
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }

    // Rule 1: Participation claim can be made ONLY on past events from today
    const today = new Date();
    const eventDate = new Date(event.endDate || event.date);
    if (eventDate > today && event.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Participation claims can only be submitted for past events that have concluded.",
      });
    }

    if (!event.allowParticipationClaims) {
      return res.status(400).json({
        success: false,
        message: "Participation claims are not enabled for this event.",
      });
    }

    // Check if user already submitted a claim
    event.participationClaims = event.participationClaims || [];
    const existingClaim = event.participationClaims.find((c: any) => {
      if (userId && c.userId && c.userId.toString() === userId.toString()) return true;
      if (c.email && c.email.toLowerCase() === claimEmail) return true;
      return false;
    });
    if (existingClaim) {
      return res.status(400).json({
        success: false,
        message: `A participation claim has already been submitted with this email (Status: ${existingClaim.status}).`,
      });
    }

    // Check if already registered or an approved attendee
    const isAlreadyAttendee =
      (userId && (event.attendees || []).some((a: any) => a.toString() === userId.toString())) ||
      (event.approvedParticipants || []).some((ap: any) => ap.email?.toLowerCase() === claimEmail);
    if (isAlreadyAttendee) {
      return res.status(400).json({
        success: false,
        message: "You are already recorded as an approved attendee for this event.",
      });
    }

    event.participationClaims.push({
      userId: userId || undefined,
      fullName: claimFullName,
      email: claimEmail,
      studentId: (studentId || (req as any).user?.studentId || "").trim(),
      department: (department || (req as any).user?.department || "").trim(),
      phone: (phone || (req as any).user?.phone || "").trim(),
      role: (role || "Participant").trim(),
      notes: (notes || "").trim(),
      status: "pending",
      claimedAt: new Date(),
    });

    await event.save();

    res.status(201).json({
      success: true,
      message: "Your participation claim has been submitted for admin verification!",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Get current logged-in user's claim for an event
 * @route GET /api/events/:id/my-claim
 */
export const getMyParticipationClaim = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: eventId } = req.params;
    const userId = (req as any).user?._id || (req as any).user?.id;
    if (!userId) {
      return res.status(200).json({ success: true, data: null, isAttendee: false });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }

    const claim = (event.participationClaims || []).find(
      (c: any) => c.userId?.toString() === userId.toString()
    );

    const isAttendee = (event.attendees || []).some(
      (a: any) => a.toString() === userId.toString()
    );

    res.status(200).json({
      success: true,
      data: claim || null,
      isAttendee,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Approve a participation claim
 * @route PATCH /api/events/:id/claims/:claimId/approve
 */
export const approveParticipationClaim = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: eventId, claimId } = req.params;
    const adminId = (req as any).user?._id || (req as any).user?.id;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }

    event.participationClaims = event.participationClaims || [];
    const claim = event.participationClaims.find((c: any) => c._id?.toString() === claimId);
    if (!claim) {
      return res.status(404).json({ success: false, message: "Participation claim not found." });
    }

    claim.status = "approved";
    claim.reviewedAt = new Date();
    claim.reviewedBy = adminId;

    // Check if a user with this email exists in DB if claim has no userId
    let targetUserId = claim.userId;
    if (!targetUserId && claim.email) {
      const matchedUser = await User.findOne({ email: claim.email.toLowerCase().trim() }).select("_id");
      if (matchedUser) {
        targetUserId = matchedUser._id;
        claim.userId = matchedUser._id;
      }
    }

    // Add to attendees if user found and not already present
    if (targetUserId && !event.attendees.some((a: any) => a.toString() === targetUserId.toString())) {
      event.attendees.push(targetUserId);
    }

    // Add to approvedParticipants if not already present
    event.approvedParticipants = event.approvedParticipants || [];
    const alreadyInApproved = event.approvedParticipants.some((p: any) => {
      if (targetUserId && p.userId && p.userId.toString() === targetUserId.toString()) return true;
      if (p.email && p.email.toLowerCase() === claim.email.toLowerCase()) return true;
      return false;
    });

    if (!alreadyInApproved) {
      event.approvedParticipants.push({
        userId: targetUserId || undefined,
        fullName: claim.fullName,
        email: claim.email,
        studentId: claim.studentId,
        department: claim.department,
        phone: claim.phone,
        isTeamLeader: false,
        approvedAt: new Date(),
      });
    }

    await event.save();

    // Link event to user profile if user exists
    if (targetUserId) {
      await User.findByIdAndUpdate(targetUserId, {
        $addToSet: { eventsAttended: event._id },
      });
    }

    // In-app notification to claimant
    createNotification({
      recipient: claim.userId,
      type: "event",
      title: "Participation Claim Approved! 🎉",
      message: `Your participation claim in "${event.title}" has been verified and approved.`,
      link: `/events/${event.slug || event._id}`,
      actionLabel: "View Event",
      priority: "high",
      metadata: { eventId: event._id },
    }).catch((err) => console.error("Claim notification error:", err));

    res.status(200).json({
      success: true,
      message: "Participation claim approved successfully.",
      data: claim,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Reject a participation claim
 * @route PATCH /api/events/:id/claims/:claimId/reject
 */
export const rejectParticipationClaim = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: eventId, claimId } = req.params;
    const adminId = (req as any).user?._id || (req as any).user?.id;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }

    event.participationClaims = event.participationClaims || [];
    const claim = event.participationClaims.find((c: any) => c._id?.toString() === claimId);
    if (!claim) {
      return res.status(404).json({ success: false, message: "Participation claim not found." });
    }

    claim.status = "rejected";
    claim.reviewedAt = new Date();
    claim.reviewedBy = adminId;

    // Remove from attendees and approvedParticipants if previously added
    if (claim.userId) {
      event.attendees = (event.attendees || []).filter(
        (a: any) => a.toString() !== claim.userId!.toString()
      );
    }
    event.approvedParticipants = (event.approvedParticipants || []).filter((p: any) => {
      if (claim.userId && p.userId && p.userId.toString() === claim.userId.toString()) return false;
      if (claim.email && p.email && p.email.toLowerCase() === claim.email.toLowerCase()) return false;
      return true;
    });

    await event.save();

    // Pull from user eventsAttended
    if (claim.userId) {
      await User.findByIdAndUpdate(claim.userId, {
        $pull: { eventsAttended: event._id },
      });
    }

    res.status(200).json({
      success: true,
      message: "Participation claim rejected.",
      data: claim,
    });
  } catch (error) {
    next(error);
  }
};

// ── Form Submissions & Bulk Approval for Events ─────────────────────────────

export const extractApplicantDetails = (responses: Record<string, any> = {}) => {
  const email =
    responses?.contact_email_address ||
    responses?.email_address ||
    responses?.email ||
    responses?.contact_email ||
    responses?.user_email ||
    "";
  const fullName =
    responses?.full_name ||
    responses?.fullName ||
    responses?.name ||
    responses?.applicant_name ||
    responses?.leader_name ||
    responses?.captain_name ||
    "Participant";
  const studentId =
    responses?.student_id ||
    responses?.studentId ||
    responses?.id_number ||
    responses?.id ||
    "";
  const department =
    responses?.department ||
    responses?.dept ||
    "";
  const batch =
    responses?.batch ||
    responses?.session ||
    "";
  const phone =
    responses?.contact_phone ||
    responses?.phone_number ||
    responses?.phone ||
    responses?.mobile ||
    "";
  const teamName =
    responses?.team_name ||
    responses?.teamName ||
    responses?.squad_name ||
    undefined;

  return {
    email: String(email || "").trim(),
    fullName: String(fullName || "").trim(),
    studentId: String(studentId || "").trim(),
    department: String(department || "").trim(),
    batch: String(batch || "").trim(),
    phone: String(phone || "").trim(),
    teamName: teamName ? String(teamName).trim() : undefined,
  };
};

/**
 * @desc Get all form submissions linked to an event with user account matching
 * @route GET /api/events/:id/form-submissions
 */
export const getEventFormSubmissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: eventId } = req.params;
    const event = await Event.findById(eventId).lean();
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    // Collect linked form IDs
    const formIdSet = new Set<string>();
    if (event.linkedForm) formIdSet.add(event.linkedForm.toString());
    if (Array.isArray(event.forms)) {
      event.forms.forEach((f: any) => formIdSet.add(f.toString()));
    }
    const formsByEvent = await FormModel.find({ eventId: event._id }).select("_id title code fields").lean();
    formsByEvent.forEach((f: any) => formIdSet.add(f._id.toString()));

    const formIds = Array.from(formIdSet).map((id) => new mongoose.Types.ObjectId(id));
    const forms = await FormModel.find({ _id: { $in: formIds } }).lean();

    if (formIds.length === 0) {
      return res.status(200).json({
        success: true,
        forms: [],
        submissions: [],
        stats: { total: 0, pending: 0, approved: 0, rejected: 0 },
      });
    }

    const rawSubmissions = await FormSubmissionModel.find({ formId: { $in: formIds } })
      .populate("userId", "fullName email studentId department imageUrl role")
      .populate("reviewedBy", "fullName email")
      .sort({ createdAt: -1 })
      .lean();

    // Collect all emails to batch-lookup website user accounts
    const allEmails = new Set<string>();
    rawSubmissions.forEach((sub: any) => {
      const details = extractApplicantDetails(sub.responses);
      if (details.email) allEmails.add(details.email.toLowerCase());
      if (sub.userId?.email) allEmails.add(sub.userId.email.toLowerCase());
    });

    const matchingUsers = await User.find({
      email: { $in: Array.from(allEmails) },
    })
      .select("fullName email studentId department imageUrl role eventsAttended")
      .lean();

    const userByEmail = new Map<string, any>();
    matchingUsers.forEach((u: any) => {
      userByEmail.set(u.email.toLowerCase(), u);
    });

    // Check who is already in event.approvedParticipants or event.attendees
    const approvedParticipantEmails = new Set(
      (event.approvedParticipants || []).map((p: any) => (p.email || "").toLowerCase()).filter(Boolean)
    );
    const approvedAttendeeUserIds = new Set(
      (event.attendees || []).map((a: any) => (a._id || a).toString())
    );

    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    const enrichedSubmissions = rawSubmissions.map((sub: any) => {
      const details = extractApplicantDetails(sub.responses);
      const user = (sub.userId as any)?._id
        ? sub.userId
        : userByEmail.get(details.email.toLowerCase()) || null;

      // Determine effective status
      let effectiveStatus = (sub as any).status || "pending";
      const isAlreadyApproved =
        approvedParticipantEmails.has(details.email.toLowerCase()) ||
        (user?._id && approvedAttendeeUserIds.has(user._id.toString()));

      if (effectiveStatus === "pending" && isAlreadyApproved) {
        effectiveStatus = "approved";
      }

      if (effectiveStatus === "approved") approvedCount++;
      else if (effectiveStatus === "rejected") rejectedCount++;
      else pendingCount++;

      return {
        ...sub,
        status: effectiveStatus,
        applicantDetails: details,
        matchedUser: user
          ? {
              _id: user._id,
              fullName: user.fullName,
              email: user.email,
              studentId: user.studentId,
              department: user.department,
              imageUrl: user.imageUrl,
              role: user.role,
              hasAccount: true,
            }
          : null,
        isAttending: isAlreadyApproved,
      };
    });

    res.status(200).json({
      success: true,
      forms,
      submissions: enrichedSubmissions,
      stats: {
        total: enrichedSubmissions.length,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Bulk approve form submissions & update participant profile activity
 * @route POST /api/events/:id/form-submissions/bulk-approve
 */
export const bulkApproveFormSubmissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: eventId } = req.params;
    const { submissionIds, approveAll } = req.body;
    const adminId = (req as any).user?._id || (req as any).user?.id;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    // Collect linked form IDs
    const formIdSet = new Set<string>();
    if (event.linkedForm) formIdSet.add(event.linkedForm.toString());
    if (Array.isArray(event.forms)) {
      event.forms.forEach((f: any) => formIdSet.add(f.toString()));
    }
    const formsByEvent = await FormModel.find({ eventId: event._id }).select("_id").lean();
    formsByEvent.forEach((f: any) => formIdSet.add(f._id.toString()));
    const formIds = Array.from(formIdSet).map((id) => new mongoose.Types.ObjectId(id));

    let query: any = { formId: { $in: formIds } };
    if (!approveAll && Array.isArray(submissionIds) && submissionIds.length > 0) {
      query._id = { $in: submissionIds.map((id: string) => new mongoose.Types.ObjectId(id)) };
    }

    const submissions = await FormSubmissionModel.find(query);
    if (submissions.length === 0) {
      return res.status(200).json({ success: true, message: "No submissions matched.", approvedCount: 0 });
    }

    let newlyApproved = 0;

    for (const sub of submissions) {
      sub.status = "approved";
      sub.reviewedAt = new Date();
      sub.reviewedBy = adminId;

      const details = extractApplicantDetails(sub.responses);

      // Look up website user by email or sub.userId
      let user = null;
      if (sub.userId) {
        user = await User.findById(sub.userId);
      }
      if (!user && details.email) {
        user = await User.findOne({
          email: { $regex: new RegExp(`^${details.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        });
      }

      if (user) {
        sub.userId = user._id as any;

        // Add to event.attendees
        if (!event.attendees.some((id: any) => id.toString() === user._id.toString())) {
          event.attendees.push(user._id as any);
        }

        // Add event to User profile eventsAttended
        await User.findByIdAndUpdate(user._id, {
          $addToSet: { eventsAttended: event._id },
        });

        // In-app notification
        createNotification({
          recipient: user._id as any,
          type: "event",
          title: "Registration Approved! 🎟️",
          message: `Your registration for "${event.title}" has been confirmed! The event has been added to your profile activity.`,
          link: `/events/${event.slug || event._id}`,
          actionLabel: "View Event",
          priority: "high",
          metadata: { eventId: event._id },
        }).catch((err) => console.error("Notification error:", err));

        // Add to event.approvedParticipants
        const existIdx = event.approvedParticipants.findIndex(
          (p: any) =>
            (p.userId && p.userId.toString() === user._id.toString()) ||
            (p.email && p.email.toLowerCase() === user.email.toLowerCase())
        );

        const participantObj = {
          userId: user._id as any,
          fullName: user.fullName || details.fullName,
          email: user.email || details.email,
          studentId: user.studentId || details.studentId,
          department: user.department || details.department,
          phone: (user as any).contactNumber || details.phone,
          teamName: details.teamName,
          isTeamLeader: !!details.teamName,
          approvedAt: new Date(),
        };

        if (existIdx >= 0) {
          event.approvedParticipants[existIdx] = participantObj;
        } else {
          event.approvedParticipants.push(participantObj);
        }
      } else {
        // Non-account guest participant
        const existIdx = event.approvedParticipants.findIndex(
          (p: any) => p.email && p.email.toLowerCase() === details.email.toLowerCase()
        );

        const participantObj = {
          fullName: details.fullName,
          email: details.email,
          studentId: details.studentId,
          department: details.department,
          phone: details.phone,
          teamName: details.teamName,
          isTeamLeader: !!details.teamName,
          approvedAt: new Date(),
        };

        if (existIdx >= 0) {
          event.approvedParticipants[existIdx] = participantObj;
        } else {
          event.approvedParticipants.push(participantObj);
        }
      }

      await sub.save();
      newlyApproved++;
    }

    await event.save();

    res.status(200).json({
      success: true,
      message: `Successfully approved ${newlyApproved} participant${newlyApproved === 1 ? "" : "s"}!`,
      approvedCount: newlyApproved,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Bulk reject form submissions
 * @route POST /api/events/:id/form-submissions/bulk-reject
 */
export const bulkRejectFormSubmissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: eventId } = req.params;
    const { submissionIds } = req.body;
    const adminId = (req as any).user?._id || (req as any).user?.id;

    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({ success: false, message: "No submission IDs provided." });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    const submissions = await FormSubmissionModel.find({
      _id: { $in: submissionIds.map((id: string) => new mongoose.Types.ObjectId(id)) },
    });

    let rejectedCount = 0;
    for (const sub of submissions) {
      sub.status = "rejected";
      sub.reviewedAt = new Date();
      sub.reviewedBy = adminId;
      await sub.save();

      const details = extractApplicantDetails(sub.responses);

      let userIdToRemove = sub.userId;
      if (!userIdToRemove && details.email) {
        const u = await User.findOne({
          email: { $regex: new RegExp(`^${details.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        }).select("_id");
        if (u) userIdToRemove = u._id;
      }

      // Remove from event.approvedParticipants and event.attendees if present
      if (details.email) {
        event.approvedParticipants = (event.approvedParticipants || []).filter(
          (p: any) => p.email?.toLowerCase() !== details.email.toLowerCase()
        );
      }
      if (userIdToRemove) {
        event.attendees = (event.attendees || []).filter(
          (a: any) => a.toString() !== userIdToRemove.toString()
        );
        event.approvedParticipants = (event.approvedParticipants || []).filter(
          (p: any) => p.userId?.toString() !== userIdToRemove.toString()
        );
        await User.findByIdAndUpdate(userIdToRemove, {
          $pull: { eventsAttended: event._id },
        });

        // Dispatch in-app notification about status update
        createNotification({
          recipient: userIdToRemove as any,
          type: "event",
          title: "Registration Update",
          message: `Your registration status for "${event.title}" has been updated to rejected.`,
          link: `/events/${event.slug || event._id}`,
          actionLabel: "View Event",
          priority: "normal",
          metadata: { eventId: event._id },
        }).catch((err) => console.error("Notification error:", err));
      }

      // Also clean up from pendingParticipants if present
      event.pendingParticipants = (event.pendingParticipants || []).filter(
        (p: any) =>
          (!details.email || p.leaderEmail?.toLowerCase() !== details.email.toLowerCase()) &&
          (!userIdToRemove || p.userId?.toString() !== userIdToRemove.toString())
      );

      rejectedCount++;
    }

    await event.save();

    res.status(200).json({
      success: true,
      message: `Rejected ${rejectedCount} submission${rejectedCount === 1 ? "" : "s"}.`,
      rejectedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Send broadcast emails & announcements to specific event audiences
 * @route POST /api/events/:id/broadcast
 */
export const sendEventBroadcast = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: eventId } = req.params;
    const {
      audience,
      subject,
      message,
      customEmails,
      isCustomHtml,
      isFullTemplate,
      bannerUrl,
      attachments,
      deliveryMethod = "bcc",
      isTestSend = false,
      testEmail,
      ccEmails,
    } = req.body;

    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({ success: false, message: "Subject and message are required." });
    }

    const event = await Event.findById(eventId)
      .populate("attendees", "fullName email")
      .populate("contributors.userId", "fullName email")
      .lean();
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    // Clean subject: ensure no redundant or automatic event title prefixes are prepended
    let cleanSubject = subject.trim();
    if (event.title) {
      const escapedTitle = event.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      cleanSubject = cleanSubject.replace(new RegExp(`^\\[\\s*${escapedTitle}\\s*\\]\\s*`, "i"), "").trim();
    }
    if (!cleanSubject) {
      cleanSubject = subject.trim();
    }

    // Linked forms to gather form respondents
    const formIdSet = new Set<string>();
    if (event.linkedForm) formIdSet.add(event.linkedForm.toString());
    if (Array.isArray(event.forms)) {
      event.forms.forEach((f: any) => formIdSet.add(f.toString()));
    }
    const formsByEvent = await FormModel.find({ eventId: event._id }).select("_id").lean();
    formsByEvent.forEach((f: any) => formIdSet.add(f._id.toString()));
    const formIds = Array.from(formIdSet).map((id) => new mongoose.Types.ObjectId(id));
    const forms = formIds.length > 0 ? await FormModel.find({ _id: { $in: formIds } }).lean() : [];
    const submissions = formIds.length > 0 ? await FormSubmissionModel.find({ formId: { $in: formIds } }).lean() : [];

    // Map recipient email -> recipient details (including custom form submission responses)
    const recipientsMap = new Map<string, { email: string; name: string; userId?: string; responses?: Record<string, any> }>();

    // 1. Approved Participants
    const addApproved = () => {
      (event.approvedParticipants || []).forEach((p: any) => {
        if (p.email) {
          const cleanEmail = p.email.toLowerCase();
          const subMatch = submissions.find((s: any) => {
            const d = extractApplicantDetails(s.responses);
            return (d.email || "").toLowerCase() === cleanEmail;
          });
          recipientsMap.set(cleanEmail, {
            email: p.email,
            name: p.fullName,
            userId: p.userId?.toString(),
            responses: subMatch ? (subMatch.responses || {}) : {},
          });
        }
      });
      (event.attendees || []).forEach((a: any) => {
        if (a?.email) {
          const cleanEmail = a.email.toLowerCase();
          const subMatch = submissions.find((s: any) => {
            const d = extractApplicantDetails(s.responses);
            return (d.email || "").toLowerCase() === cleanEmail;
          });
          recipientsMap.set(cleanEmail, {
            email: a.email,
            name: a.fullName,
            userId: a._id?.toString(),
            responses: subMatch ? (subMatch.responses || {}) : {},
          });
        }
      });
    };

    // 2. Pending Registrants (Derived strictly from pending form responses)
    const addPending = () => {
      const approvedEmails = new Set(
        (event.approvedParticipants || []).map((p: any) => (p.email || "").toLowerCase()).filter(Boolean)
      );
      submissions.forEach((sub: any) => {
        if (sub.status !== "approved" && sub.status !== "rejected") {
          const details = extractApplicantDetails(sub.responses);
          const email = (details.email || "").toLowerCase();
          if (email && !approvedEmails.has(email)) {
            recipientsMap.set(email, {
              email: details.email,
              name: details.fullName || "Applicant",
              userId: sub.userId?.toString(),
              responses: sub.responses || {},
            });
          }
        }
      });
    };

    // 3. Organizers & Volunteers
    const addVolunteers = () => {
      (event.contributors || []).forEach((c: any) => {
        const email = c.email || (c.userId as any)?.email;
        const name = c.name || (c.userId as any)?.fullName || "Team Member";
        if (email) recipientsMap.set(email.toLowerCase(), { email, name, userId: (c.userId as any)?._id?.toString(), responses: {} });
      });
    };

    // 4. Sponsors
    const addSponsors = () => {
      (event.eventSponsors || []).forEach((s: any) => {
        // If sponsor contact is tracked
      });
    };

    if (audience === "approved_participants") {
      addApproved();
    } else if (audience === "pending_registrants") {
      addPending();
    } else if (audience === "volunteers") {
      addVolunteers();
    } else if (audience === "sponsors") {
      addSponsors();
    } else if (audience === "all") {
      addApproved();
      addPending();
      addVolunteers();
      addSponsors();
    } else if (audience === "custom" && Array.isArray(customEmails)) {
      customEmails.forEach((email: string) => {
        if (email && email.includes("@")) {
          const cleanEmail = email.trim().toLowerCase();
          let matchedName = "Participant";
          let matchedResponses: Record<string, any> = {};
          const subMatch = submissions.find((s: any) => {
            const d = extractApplicantDetails(s.responses);
            return d.email && d.email.toLowerCase() === cleanEmail;
          });
          if (subMatch) {
            matchedName = extractApplicantDetails(subMatch.responses).fullName || "Participant";
            matchedResponses = subMatch.responses || {};
          } else {
            const userMatch = (event.approvedParticipants || []).find(
              (p: any) => p.email && p.email.toLowerCase() === cleanEmail
            );
            if (userMatch) matchedName = userMatch.fullName;
          }
          recipientsMap.set(cleanEmail, { email: email.trim(), name: matchedName, responses: matchedResponses });
        }
      });
    }

    const recipientList = Array.from(recipientsMap.values());
    if (recipientList.length === 0) {
      return res.status(400).json({ success: false, message: "No valid recipient email addresses found for the chosen audience." });
    }

    // Format message as HTML
    const formattedDate = new Date(event.date).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    let sentCount = 0;
    let failedCount = 0;

    // Determine appropriate greeting based on audience and recipient count
    const getGroupGreeting = (aud: string): string => {
      switch (aud) {
        case "approved_participants":
          return "Hello Participants & Attendees!";
        case "pending_registrants":
          return "Hello Applicants & Registrants!";
        case "volunteers":
          return "Hello Organizing Team & Volunteers!";
        case "sponsors":
          return "Hello Valued Sponsors & Partners!";
        case "all":
        case "custom":
        default:
          return "Hello Everyone!";
      }
    };

    // Unified token substitution engine for message body AND subject line
    const substituteTokens = (
      rawText: string,
      recipientName = "",
      recipientEmail = "",
      recipientResponses: Record<string, any> = {}
    ): string => {
      if (!rawText) return "";
      const effectiveName =
        recipientName || (recipientList.length === 1 ? recipientList[0].name : "") || "Participant";
      const effectiveEmail =
        recipientEmail || (recipientList.length === 1 ? recipientList[0].email : "") || "";
      const effectiveResponses =
        recipientResponses && Object.keys(recipientResponses).length > 0
          ? recipientResponses
          : recipientList.length === 1 && recipientList[0].responses
          ? recipientList[0].responses
          : {};

      const branding = getGlobalEmailBranding();

      // 1. Process base standard tokens
      let text = rawText
        .replace(/{{\s*greeting\s*}}/g, `Hello, ${effectiveName}!`)
        .replace(/{{\s*userName\s*}}/g, effectiveName)
        .replace(/{{\s*name\s*}}/g, effectiveName)
        .replace(/{{\s*email\s*}}/g, effectiveEmail)
        .replace(/{{\s*eventName\s*}}/g, event.title)
        .replace(/{{\s*eventDate\s*}}/g, formattedDate)
        .replace(/{{\s*eventVenue\s*}}/g, event.location || "MEC Campus")
        .replace(/{{\s*clubName\s*}}/g, branding.clubName);

      // 2. Generic Dynamic Form Fields Substitution
      // Replaces ANY field submitted in the form (e.g. {{session}}, {{pubg ID}}, {{pubg_id}}, {{t_shirt_size}}, etc.)
      if (effectiveResponses && typeof effectiveResponses === "object") {
        const normalizedResponsesMap = new Map<string, string>();
        for (const [key, val] of Object.entries(effectiveResponses)) {
          if (val === undefined || val === null) continue;
          const strVal = typeof val === "object" ? JSON.stringify(val) : String(val);
          normalizedResponsesMap.set(key.toLowerCase(), strVal);
          const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (cleanKey) {
            normalizedResponsesMap.set(cleanKey, strVal);
          }
        }

        // Map form field labels to response keys if forms catalog exists
        if (Array.isArray(forms)) {
          forms.forEach((f: any) => {
            if (Array.isArray(f.fields)) {
              f.fields.forEach((fld: any) => {
                if (fld.name && fld.label && effectiveResponses[fld.name] !== undefined) {
                  const strVal = String(effectiveResponses[fld.name] ?? "");
                  normalizedResponsesMap.set(fld.label.toLowerCase(), strVal);
                  const cleanLabel = fld.label.toLowerCase().replace(/[^a-z0-9]/g, "");
                  if (cleanLabel) normalizedResponsesMap.set(cleanLabel, strVal);
                }
              });
            }
          });
        }

        text = text.replace(/{{\s*([^{}]+?)\s*}}/g, (match: string, rawKey: string) => {
          const trimmed = rawKey.trim();
          const lower = trimmed.toLowerCase();
          const clean = lower.replace(/[^a-z0-9]/g, "");

          if (normalizedResponsesMap.has(lower)) {
            return normalizedResponsesMap.get(lower)!;
          }
          if (clean && normalizedResponsesMap.has(clean)) {
            return normalizedResponsesMap.get(clean)!;
          }

          if (clean === "fullname" || clean === "name" || clean === "username") return effectiveName;
          if (clean === "email" || clean === "emailaddress" || clean === "contactemail") return effectiveEmail;

          return match;
        });
      }

      return text;
    };

    const generateEmailHtml = (
      greeting: string,
      recipientEmail = "",
      recipientName = "",
      recipientResponses: Record<string, any> = {}
    ): string => {
      const branding = getGlobalEmailBranding();
      const processedMessage = substituteTokens(message, recipientName, recipientEmail, recipientResponses);

      if (isCustomHtml) {
        return processedMessage;
      }
      // Use specified bannerUrl if provided; otherwise fallback to global branding
      const chosenBanner = bannerUrl !== undefined ? bannerUrl : branding.bannerUrl;

      // Format attachments & links blocks if any exist
      let attachmentsBlock = "";
      if (Array.isArray(attachments) && attachments.length > 0) {
        const directFiles = attachments.filter((att: any) => att && att.content);
        const externalLinks = attachments.filter((att: any) => att && !att.content && att.url);

        let filesHtml = "";
        if (directFiles.length > 0) {
          const rows = directFiles
            .map((att: any) => {
              const sizeStr = att.size
                ? ` <span style="font-size: 11px; color: #64748b; font-weight: normal;">(${(att.size / 1024).toFixed(1)} KB)</span>`
                : "";
              return `<tr>
                <td style="padding: 9px 0; border-bottom: 1px solid #edf2f7; font-size: 13px;">
                  <span style="font-size: 14px; margin-right: 6px;">📄</span>
                  <span style="color: #002e5b; font-weight: 600;">${att.name || "Attachment"}</span>${sizeStr}
                </td>
                <td align="right" style="padding: 9px 0; border-bottom: 1px solid #edf2f7; color: #166534; font-size: 11px; font-weight: 700;">
                  Attached Directly 📎
                </td>
              </tr>`;
            })
            .join("");

          filesHtml = `
            <div class="email-box-card" style="margin: 20px 0 16px; padding: 16px 18px; background-color: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 10px;">
              <p style="margin: 0 0 8px; font-weight: 700; color: #166534; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                📎 Attached Documents (${directFiles.length})
              </p>
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                ${rows}
              </table>
              <p style="margin: 8px 0 0; font-size: 11px; color: #15803d; line-height: 1.4;">
                Files are attached directly to this email message. You can preview or download them using your email app.
              </p>
            </div>
          `;
        }

        let linksHtml = "";
        if (externalLinks.length > 0) {
          const rows = externalLinks
            .map((att: any) => {
              return `<tr>
                <td style="padding: 9px 0; border-bottom: 1px solid #e0e7ff; font-size: 13px;">
                  <span style="font-size: 14px; margin-right: 6px;">🔗</span>
                  <a href="${att.url}" target="_blank" style="color: #1e40af; font-weight: 600; text-decoration: none;">
                    ${att.name || "External Resource"}
                  </a>
                </td>
                <td align="right" style="padding: 9px 0; border-bottom: 1px solid #e0e7ff;">
                  <a href="${att.url}" target="_blank" style="display: inline-block; padding: 5px 12px; background: #1e40af; color: #ffffff !important; border-radius: 6px; font-size: 11px; font-weight: 700; text-decoration: none;">
                    Open Link &rarr;
                  </a>
                </td>
              </tr>`;
            })
            .join("");

          linksHtml = `
            <div class="email-box-card" style="margin: 16px 0 20px; padding: 16px 18px; background-color: #eef2ff; border: 1.5px solid #c7d2fe; border-radius: 10px;">
              <p style="margin: 0 0 8px; font-weight: 700; color: #3730a3; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                🔗 Resource &amp; Reference Links (${externalLinks.length})
              </p>
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                ${rows}
              </table>
            </div>
          `;
        }

        attachmentsBlock = filesHtml + linksHtml;
      }

      const bannerImg = chosenBanner
        ? `<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td width="100%"><img src="${chosenBanner}" alt="${branding.clubName}" class="email-banner-img" style="width: 100%; max-width: 600px; height: auto; display: block; border-radius: 12px 12px 0 0;" /></td></tr></table>`
        : "";

      // Check if processedMessage already provides its own header/greeting/card/signoff (e.g. from the WYSIWYG studio canvas)
      const hasHeadingOrGreeting =
        Boolean(isFullTemplate) ||
        /<(h[1-3])[^>]*>/i.test(processedMessage) ||
        /email-title|header-text/i.test(processedMessage) ||
        /^\s*<p[^>]*>\s*(Hello|Dear|Hi|Greetings)/i.test(processedMessage);

      const hasReferenceCard =
        Boolean(isFullTemplate) ||
        /email-box-card/i.test(processedMessage) ||
        /Event Reference/i.test(processedMessage);

      const hasSignoff =
        Boolean(isFullTemplate) ||
        /email-signoff/i.test(processedMessage) ||
        /Best regards|Warm regards|Sincerely/i.test(processedMessage);

      let bodyHtml = /<[a-z][\s\S]*>/i.test(processedMessage)
        ? processedMessage
        : processedMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

      // Attachments placement: insert right above the sign-off if sign-off exists, otherwise append
      if (attachmentsBlock) {
        if (bodyHtml.includes('class="email-signoff"')) {
          bodyHtml = bodyHtml.replace('class="email-signoff"', `${attachmentsBlock}\n<div class="email-signoff"`);
        } else {
          bodyHtml += attachmentsBlock;
        }
      }

      const headerHtml = hasHeadingOrGreeting
        ? ""
        : `<h1 class="email-title-h1" style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #002e5b; font-family: 'Inter', -apple-system, sans-serif; letter-spacing: -0.3px; line-height: 1.3;">
            ${event.title}
          </h1>
          <p style="margin: 0 0 18px; font-size: 16px; font-weight: 600; color: #002e5b;">
            ${greeting}
          </p>`;

      const referenceCardHtml = hasReferenceCard
        ? ""
        : `<div class="email-box-card" style="margin: 20px 0; padding: 16px 18px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;">
            <p style="margin: 0 0 8px; font-weight: 700; color: #002e5b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
              Event Reference &amp; Schedule
            </p>
            <p style="margin: 0 0 4px; font-size: 14px; font-weight: 700; color: #0f172a;">${event.title}</p>
            <p style="margin: 0 0 4px; font-size: 13px; color: #475569;">📅 <strong>Date:</strong> ${formattedDate} ${event.eventTime ? `• ${event.eventTime}` : ""}</p>
            <p style="margin: 0 0 4px; font-size: 13px; color: #475569;">📍 <strong>Venue:</strong> ${event.location || "MEC Campus"}</p>
            ${event.onlineLink ? `<p style="margin: 6px 0 0; font-size: 13px; color: #002e5b;"><a href="${event.onlineLink}" target="_blank" style="color: #002e5b; font-weight: 600; text-decoration: underline;">🔗 Join Virtual Session</a></p>` : ""}
          </div>`;

      const signoffHtml = hasSignoff
        ? ""
        : `<div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 14px; color: #64748b;">
            <p style="margin: 0 0 4px;">Best regards,</p>
            <p style="margin: 0; font-weight: 700; color: #002e5b;">${branding.clubName} Executive Team</p>
          </div>`;

      return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
  <title>${cleanSubject}</title>
  <style type="text/css">
    /* Global Resets */
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      -webkit-text-size-adjust: 100% !important;
      -ms-text-size-adjust: 100% !important;
    }
    table, td {
      mso-table-lspace: 0pt !important;
      mso-table-rspace: 0pt !important;
      border-collapse: collapse !important;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }

    /* Mobile Responsive Styles */
    @media only screen and (max-width: 600px) {
      .email-body-wrapper {
        padding: 12px 6px !important;
        background-color: #f3f4f6 !important;
      }
      .email-outer-td {
        padding: 0 4px !important;
      }
      .email-container-table {
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 12px !important;
        border: 1px solid #e5e7eb !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06) !important;
        overflow: hidden !important;
        background-color: #ffffff !important;
      }
      .email-banner-img {
        border-radius: 12px 12px 0 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        display: block !important;
      }
      .email-content-cell {
        padding: 16px 12px 20px !important;
      }
      .email-title-h1 {
        font-size: 20px !important;
        line-height: 1.35 !important;
        margin-bottom: 10px !important;
      }
      .email-box-card {
        padding: 10px 12px !important;
        margin: 14px 0 !important;
      }
      .email-footer-cell {
        padding: 18px 14px 24px !important;
      }
    }
  </style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; color: #1e293b; width: 100% !important;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" class="email-body-wrapper" style="background-color: #f3f4f6; margin: 0; padding: 16px 0; width: 100%;">
    <tr>
      <td align="center" class="email-outer-td" style="padding: 0 4px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container-table" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); overflow: hidden; border: 1px solid #e5e7eb;">
          ${bannerImg}
          <tr>
            <td class="email-content-cell" style="padding: 24px 20px 28px;">
              ${headerHtml}

              <div style="font-size: 15px; line-height: 1.65; color: #4b5563; margin-bottom: 24px;">
                ${bodyHtml}
              </div>

              ${referenceCardHtml}

              ${signoffHtml}
            </td>
          </tr>

          <!-- Footer Cell -->
          <tr>
            <td align="center" class="email-footer-cell" style="padding: 20px 16px 26px; background-color: #fafafa; border-top: 1px solid #edf2f7; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #9ca3af; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} ${branding.clubName}.
                <br />
                ${branding.footerAddress}
                ${branding.footerNote ? `<br /><span style="font-size: 11px; color: #b0b0b0; display: inline-block; margin-top: 4px;">${branding.footerNote}</span>` : ""}
              </p>
              <div style="margin-top: 10px;">
                <a href="${branding.websiteUrl}" target="_blank" style="color: #002e5b; text-decoration: none; font-size: 12px; margin: 0 10px; font-weight: 600;">Website</a>
                <span style="color: #cbd5e1;">|</span>
                <a href="${branding.contactUrl}" target="_blank" style="color: #002e5b; text-decoration: none; font-size: 12px; margin: 0 10px; font-weight: 600;">Support &amp; Contact</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    };

    // Strictly resolve direct base64 file attachments for Nodemailer.
    // URL links are NEVER fetched as file attachments - they belong exclusively in the email body!
    let mailAttachments: { filename: string; content: Buffer; contentType?: string }[] | undefined;
    if (Array.isArray(attachments) && attachments.length > 0) {
      const resolvedList: { filename: string; content: Buffer; contentType?: string }[] = [];

      for (const att of attachments) {
        if (!att || !att.content) continue; // Only attach files with actual content

        try {
          const rawBase64 = att.content.includes(",")
            ? att.content.split(",")[1]
            : att.content;
          resolvedList.push({
            filename: att.name || "attachment",
            content: Buffer.from(rawBase64, "base64"),
            contentType: att.mimeType,
          });
        } catch (err) {
          console.error(`Failed to buffer base64 attachment "${att.name}":`, err);
        }
      }

      if (resolvedList.length > 0) {
        mailAttachments = resolvedList;
      }
    }

    // Sanitize CC emails if provided
    const sanitizedCcList: string[] = Array.isArray(ccEmails)
      ? ccEmails.map((e: any) => String(e).trim()).filter((e: string) => e.includes("@"))
      : typeof ccEmails === "string"
      ? ccEmails.split(/[\n,;]+/).map((e: string) => e.trim()).filter((e: string) => e.includes("@"))
      : [];

    // 0. Handle Test Send Option
    if (isTestSend && testEmail && testEmail.includes("@")) {
      const singleGreeting = "Hello Administrator (Test Copy)!";
      const adminName = (req as any).user?.fullName || "Administrator";
      const sampleResponses: Record<string, any> =
        submissions.length > 0 && submissions[0].responses
          ? submissions[0].responses
          : { session: "2021-22", pubg_id: "5123984124" };
      const emailHtml = generateEmailHtml(singleGreeting, testEmail.trim(), adminName, sampleResponses);
      const testSubject = cleanSubject.startsWith("[TEST COPY]")
        ? cleanSubject
        : `[TEST COPY] ${cleanSubject}`;
      const substitutedTestSubject = substituteTokens(testSubject, adminName, testEmail.trim(), sampleResponses);
      try {
        await sendEmail({
          to: testEmail.trim(),
          cc: sanitizedCcList.length > 0 ? sanitizedCcList : undefined,
          subject: substitutedTestSubject,
          html: emailHtml,
          attachments: mailAttachments,
          category: "official",
        });
        return res.status(200).json({
          success: true,
          message: `Test email successfully dispatched to ${testEmail}${sanitizedCcList.length > 0 ? ` (CC: ${sanitizedCcList.join(", ")})` : ""}!`,
        });
      } catch (err: any) {
        console.error(`Failed to send test email to ${testEmail}:`, err);
        return res.status(500).json({
          success: false,
          message: `Failed to send test email: ${err.message || "SMTP error"}`,
        });
      }
    }

    const bccEmailList = recipientList.map((r) => r.email).filter(Boolean);

    // 1. Individual Personalized Dispatch
    if (deliveryMethod === "individual") {
      for (const recipient of recipientList) {
        const singleGreeting = `Hello, ${recipient.name || "Participant"}!`;
        const emailHtml = generateEmailHtml(singleGreeting, recipient.email, recipient.name, recipient.responses || {});
        const perRecipientSubject = substituteTokens(cleanSubject, recipient.name, recipient.email, recipient.responses || {});
        try {
          await sendEmail({
            to: recipient.email,
            subject: perRecipientSubject,
            html: emailHtml,
            attachments: mailAttachments,
            category: "official",
          });
          sentCount++;
        } catch (err) {
          console.error(`Failed to dispatch personalized email to ${recipient.email}:`, err);
          failedCount++;
        }
      }

      // If CC recipients exist, send one clean broadcast copy to CC
      if (sanitizedCcList.length > 0) {
        const groupGreeting = getGroupGreeting(audience);
        const emailHtml = generateEmailHtml(groupGreeting);
        try {
          await sendEmail({
            cc: sanitizedCcList,
            subject: cleanSubject,
            html: emailHtml,
            attachments: mailAttachments,
            category: "official",
          });
        } catch (err) {
          console.error("Failed to dispatch CC broadcast copy in individual mode:", err);
        }
      }
    } else if (deliveryMethod === "cc") {
      // 2. CC Batch Broadcast (Recipients visible to each other in CC)
      if (recipientList.length === 1) {
        const recipient = recipientList[0];
        const singleGreeting = `Hello, ${recipient.name || "Participant"}!`;
        const emailHtml = generateEmailHtml(singleGreeting, recipient.email, recipient.name, recipient.responses || {});
        const perRecipientSubject = substituteTokens(cleanSubject, recipient.name, recipient.email, recipient.responses || {});
        const combinedCc = Array.from(new Set([...sanitizedCcList]));
        try {
          await sendEmail({
            to: recipient.email,
            cc: combinedCc.length > 0 ? combinedCc : undefined,
            subject: perRecipientSubject,
            html: emailHtml,
            attachments: mailAttachments,
            category: "official",
          });
          sentCount++;
        } catch (err) {
          console.error(`Failed to broadcast to ${recipient.email}:`, err);
          failedCount++;
        }
      } else {
        const groupGreeting = getGroupGreeting(audience);
        const emailHtml = generateEmailHtml(groupGreeting);
        const BATCH_SIZE = 50;

        for (let i = 0; i < bccEmailList.length; i += BATCH_SIZE) {
          const chunk = bccEmailList.slice(i, i + BATCH_SIZE);
          const combinedCc = Array.from(new Set([...chunk, ...sanitizedCcList]));
          try {
            await sendEmail({
              cc: combinedCc,
              subject: cleanSubject,
              html: emailHtml,
              attachments: mailAttachments,
              category: "official",
            });
            sentCount += chunk.length;
          } catch (err) {
            console.error(`Failed to send CC broadcast batch (size ${chunk.length}):`, err);
            failedCount += chunk.length;
          }
        }
      }
    } else {
      // 3. Default: BCC Batch Broadcast (Recipients private in BCC)
      if (recipientList.length === 1) {
        const recipient = recipientList[0];
        const singleGreeting = `Hello, ${recipient.name || "Participant"}!`;
        const emailHtml = generateEmailHtml(singleGreeting, recipient.email, recipient.name, recipient.responses || {});
        const perRecipientSubject = substituteTokens(cleanSubject, recipient.name, recipient.email, recipient.responses || {});
        try {
          await sendEmail({
            to: recipient.email,
            cc: sanitizedCcList.length > 0 ? sanitizedCcList : undefined,
            subject: perRecipientSubject,
            html: emailHtml,
            attachments: mailAttachments,
            category: "official",
          });
          sentCount++;
        } catch (err) {
          console.error(`Failed to broadcast to ${recipient.email}:`, err);
          failedCount++;
        }
      } else {
        const groupGreeting = getGroupGreeting(audience);
        const emailHtml = generateEmailHtml(groupGreeting);
        const BATCH_SIZE = 50;

        for (let i = 0; i < bccEmailList.length; i += BATCH_SIZE) {
          const chunk = bccEmailList.slice(i, i + BATCH_SIZE);
          try {
            await sendEmail({
              bcc: chunk,
              cc: i === 0 && sanitizedCcList.length > 0 ? sanitizedCcList : undefined,
              subject: cleanSubject,
              html: emailHtml,
              attachments: mailAttachments,
              category: "official",
            });
            sentCount += chunk.length;
          } catch (err) {
            console.error(`Failed to send BCC broadcast batch (size ${chunk.length}):`, err);
            failedCount += chunk.length;
          }
        }
      }
    }


    // Audit log
    const actorUser = (req as any).user;
    const modeLabel = deliveryMethod === "individual" ? "DIRECT" : deliveryMethod === "cc" ? "CC" : "BCC";
    if (actorUser) {
      AuditLog.create({
        actorId: actorUser._id,
        actorName: actorUser.fullName || actorUser.email,
        actorRole: actorUser.role || "admin",
        action: "BROADCAST_EMAIL",
        targetType: "EVENT",
        targetId: event._id?.toString(),
        description: `Dispatched ${modeLabel} broadcast email to ${sentCount} recipients for event "${event.title}" (Audience: ${audience})${sanitizedCcList.length > 0 ? ` with ${sanitizedCcList.length} CC recipient(s)` : ""}.`,
        metadata: {
          eventId: event._id,
          audience,
          subject: cleanSubject,
          sentCount,
          failedCount,
          ccCount: sanitizedCcList.length,
          deliveryMode: modeLabel,
        },
      }).catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: `Broadcast dispatched! Successfully sent via ${modeLabel} to ${sentCount} recipient${sentCount === 1 ? "" : "s"}${sanitizedCcList.length > 0 ? ` (+${sanitizedCcList.length} CC)` : ""}${failedCount > 0 ? ` (${failedCount} failed)` : ""}.`,
      sentCount,
      failedCount,
      ccCount: sanitizedCcList.length,
      totalRecipients: recipientList.length,
      deliveryMode: modeLabel,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get all saved custom email templates for a specific event
 * @route GET /api/events/:id/email-templates
 */
export const getEventSavedEmailTemplates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id).select("savedEmailTemplates title").lean();
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }
    return res.status(200).json({
      success: true,
      data: (event as any).savedEmailTemplates || [],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Save or update an event-specific custom email template
 * @route POST /api/events/:id/email-templates
 */
export const saveEventEmailTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { templateId, name, subject, body, isHtml, audience, bannerUrl, attachments } = req.body;

    if (!name?.trim() || !subject?.trim() || !body?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Template name, subject, and content are required.",
      });
    }

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    if (!event.savedEmailTemplates) {
      event.savedEmailTemplates = [];
    }

    let savedItem: any = null;

    if (templateId) {
      const existing = (event.savedEmailTemplates as any).id(templateId);
      if (existing) {
        existing.name = name.trim();
        existing.subject = subject.trim();
        existing.body = body;
        existing.isHtml = Boolean(isHtml);
        existing.audience = audience || "approved_participants";
        if (bannerUrl !== undefined) existing.bannerUrl = bannerUrl;
        if (Array.isArray(attachments)) existing.attachments = attachments;
        existing.updatedAt = new Date();
        savedItem = existing;
      }
    }

    if (!savedItem) {
      const newTemplate = {
        name: name.trim(),
        subject: subject.trim(),
        body,
        isHtml: Boolean(isHtml),
        audience: audience || "approved_participants",
        bannerUrl: bannerUrl || "",
        attachments: Array.isArray(attachments) ? attachments : [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      event.savedEmailTemplates.push(newTemplate as any);
      savedItem = event.savedEmailTemplates[event.savedEmailTemplates.length - 1];
    }

    await event.save();

    return res.status(200).json({
      success: true,
      message: `Template "${savedItem.name}" saved to event details!`,
      data: savedItem,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Delete a saved email template from an event
 * @route DELETE /api/events/:id/email-templates/:templateId
 */
export const deleteEventSavedEmailTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, templateId } = req.params;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    if (!event.savedEmailTemplates) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    event.savedEmailTemplates = (event.savedEmailTemplates as any).filter(
      (t: any) => t._id?.toString() !== templateId
    );

    await event.save();

    return res.status(200).json({
      success: true,
      message: "Event email template removed successfully.",
    });
  } catch (error) {
    next(error);
  }
};

