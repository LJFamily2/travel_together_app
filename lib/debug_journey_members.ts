import mongoose from "mongoose";
import Journey from "./models/Journey";
import User from "./models/User";
import dbConnect from "./mongodb";

const isDev = process.env.NODE_ENV !== "production";

async function checkMembers() {
  await dbConnect();
  const journeys = await Journey.find({}).populate("members");

  if (isDev) {
    console.debug("--- Journeys ---");
    journeys.forEach((j) => {
      console.debug(`Journey: ${j.name} (ID: ${j._id})`);
      console.debug(`Member Count: ${j.members.length}`);
      j.members.forEach((m: any) => {
        console.debug(` - ${m.name} (${m._id})`);
      });
      console.debug("----------------");
    });
  }

  // Do not exit the process if used as a module; if invoked directly, allow the caller to control process exit.
}

export default checkMembers;
