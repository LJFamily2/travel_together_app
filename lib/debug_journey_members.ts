import mongoose from "mongoose";
import Journey from "./models/Journey";
import User from "./models/User";
import dbConnect from "./mongodb";

async function checkMembers() {
  await dbConnect();
  const journeys = await Journey.find({}).populate("members");

  console.log("--- Journeys ---");
  journeys.forEach((j) => {
    console.log(`Journey: ${j.name} (ID: ${j._id})`);
    console.log(`Member Count: ${j.members.length}`);
    j.members.forEach((m: any) => {
      console.log(` - ${m.name} (${m._id})`);
    });
    console.log("----------------");
  });

  process.exit(0);
}

checkMembers();
