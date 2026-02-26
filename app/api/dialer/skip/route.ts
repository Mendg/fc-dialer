import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { queueId } = body;

    if (!queueId) {
      return NextResponse.json(
        { error: "queueId required" },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().split("T")[0];

    // Get the max position for today
    const maxPos = await pool.query(
      "SELECT MAX(position) as max_pos FROM daily_call_queue WHERE date = $1",
      [today]
    );

    const newPosition = (maxPos.rows[0]?.max_pos || 0) + 1;

    // Move this contact to end of queue and increment skip_count
    await pool.query(
      "UPDATE daily_call_queue SET position = $1, skip_count = COALESCE(skip_count, 0) + 1 WHERE id = $2",
      [newPosition, queueId]
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Skip error:", err);
    return NextResponse.json({ error: "Failed to skip" }, { status: 500 });
  }
}
