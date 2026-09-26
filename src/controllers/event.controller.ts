import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import * as EventService from "../services/event.service";
import { Event } from "../models/Event.model";
import User from "../models/User.model";
import FormModel from "../models/Form.model";
import { Certificate } from "../models/Certificate.model";
import { Media } from "../models/Media.model";
import { uploadToCloudinary, deleteFromCloudinary } from "../services/upload.service";
import { sendEmail } from "../utils/sendEmail";
import { createNotification, createBroadcastNotification } from "../services/notification.service";
import crypto from "crypto";

// ── Basic CRUD ─────────────────────────────────────────────────────────────

export const handleCreateEvent = async (req: Request, res: Response) => {
  try {
    if (!req.body.linkedForm || req.body.linkedForm === "" || !mongoose.Types.ObjectId.isValid(req.body.linkedForm)) {
      delete req.body.linkedForm;
    }

    const event = await EventService.createEvent(req.body);

    // Two-way sync: If linkedForm was selected, link form to this event (it is no longer independent)
    if (event.linkedForm && mongoose.Types.ObjectId.isValid(event.linkedForm.toString())) {
      await FormModel.findByIdAndUpdate(event.linkedForm, { eventId: event._id });
    }

    // Broadcast in-app notification about new event (executives & current members only, excluding alumni/advisors)
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
    res.status(200).json({ success: true, count: events.length, data: events });
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
      });

    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    // Normalise — ensure arrays exist even on old documents
    const data = event.toObject({ virtuals: true });
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

    // Resolve recipient details for email confirmation
    let recipientEmail = participant.leaderEmail;
    let recipientName = participant.leaderName || participant.teamName;

    if (!recipientEmail && participant.userId) {
      const user = await User.findById(participant.userId);
      if (user) {
        recipientEmail = user.email;
        recipientName = recipientName || user.fullName;
      }
    }

    // Send confirmation email asynchronously
    if (recipientEmail) {
      try {
        const formattedDate = new Date(event.date).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8f8f6; color: #1a1a1a; margin: 0; padding: 24px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 2px solid #1a1a1a; border-radius: 12px; box-shadow: 6px 6px 0px #1a1a1a; overflow: hidden; }
    .header { background: #0f766e; color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .badge { display: inline-block; background: #ffffff; color: #0f766e; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 9999px; margin-bottom: 12px; }
    .content { padding: 28px; }
    .details { background: #f3f4f6; border-radius: 8px; border: 1px solid #e5e7eb; padding: 18px; margin: 20px 0; }
    .details-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .label { color: #6b7280; font-weight: 600; }
    .val { color: #111827; font-weight: 700; }
    .members-list { margin: 12px 0 0 0; padding-left: 20px; font-size: 13px; color: #374151; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="badge">Official Registration Confirmation</div>
      <h1>${event.title}</h1>
    </div>
    <div class="content">
      <p style="font-size: 16px;">Hello <strong>${recipientName || "Participant"}</strong>,</p>
      <p style="color: #374151; line-height: 1.6;">
        Congratulations! Your registration for <strong>${event.title}</strong> has been officially approved by the MEC Computer Club administration.
      </p>

      ${participant.teamName ? `
        <div style="background: #eef2ff; border-left: 4px solid #6366f1; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
          <strong style="color: #3730a3; font-size: 14px;">Registered Team: ${participant.teamName}</strong>
          ${participant.members && participant.members.length > 0 ? `
            <ul class="members-list">
              <li>Leader: ${participant.leaderName || recipientName} ${participant.inGameId ? `(UID: ${participant.inGameId})` : ""}</li>
              ${participant.members.map((m: any) => `<li>${m.fullName} ${m.studentId ? `(${m.studentId})` : ""} ${m.inGameId ? `- UID: ${m.inGameId}` : ""}</li>`).join("")}
            </ul>
          ` : ""}
        </div>
      ` : ""}

      <div class="details">
        <div class="details-row">
          <span class="label">Date:</span>
          <span class="val">${formattedDate}</span>
        </div>
        ${event.eventTime ? `
        <div class="details-row">
          <span class="label">Time:</span>
          <span class="val">${event.eventTime}</span>
        </div>` : ""}
        <div class="details-row">
          <span class="label">Venue / Location:</span>
          <span class="val">${event.location}</span>
        </div>
        ${event.prizePool ? `
        <div class="details-row">
          <span class="label">Prize Pool:</span>
          <span class="val" style="color: #059669;">${event.prizePool}</span>
        </div>` : ""}
      </div>

      <p style="color: #4b5563; font-size: 14px; line-height: 1.5;">
        Please make sure all participants arrive on time. For any queries, reach out to us at 
        <a href="mailto:${event.contactEmail || "contact@meccomputerclub.org"}" style="color: #0f766e; font-weight: 600;">${event.contactEmail || "contact@meccomputerclub.org"}</a>.
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} MEC Computer Club &bull; Mymensingh Engineering College
    </div>
  </div>
</body>
</html>
        `;

        await sendEmail(recipientEmail, `Registration Confirmed: ${event.title} - MEC-CC`, emailHtml);
      } catch (mailErr) {
        console.error("Failed to send approval email (non-fatal):", mailErr);
      }
    }

    res.status(200).json({
      success: true,
      message: `Registration approved for ${recipientName || "participant"}. Confirmation email dispatched.`,
    });
  } catch (error) { next(error); }
};

/**
 * @desc  Reject a pending participant
 * @route PATCH /api/events/:id/participants/:userId/reject
 */
export const rejectParticipant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: eventId, userId: targetId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    event.pendingParticipants = event.pendingParticipants.filter(
      (p: any) => p._id?.toString() !== targetId && p.userId?.toString() !== targetId
    ) as any;
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
