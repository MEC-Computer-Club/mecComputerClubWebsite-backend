// services/event.service.ts
import { FilterQuery, UpdateQuery } from "mongoose";
import { Event, IEvent } from "../models/Event.model";

export const createEvent = async (data: Partial<IEvent>): Promise<IEvent> => {
  return await Event.create(data);
};

export const getAllEvents = async (filter: FilterQuery<IEvent> = {}, sort: any = { date: -1 }) => {
  return await Event.find(filter)
    .populate("attendees", "fullName email")
    .populate("linkedForm", "title code")
    .sort(sort);
};

export const getEventById = async (id: string) => {
  return await Event.findById(id)
    .populate("attendees media projects forms linkedForm")
    .populate({
      path: "certificates",
      populate: [
        { path: "recipient", select: "fullName email studentId department batch imageUrl" },
        { path: "template" },
      ],
    });
};

export const updateEvent = async (id: string, updateData: UpdateQuery<IEvent>) => {
  return await Event.findByIdAndUpdate(id, updateData, {
    new: true, // returns the updated document
    runValidators: true,
  });
};

export const deleteEvent = async (id: string) => {
  return await Event.findByIdAndDelete(id);
};
