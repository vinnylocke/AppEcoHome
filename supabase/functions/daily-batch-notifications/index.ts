import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

serve(async (req) => {
  try {
    // 1. Initialize Supabase Admin Client
    // We use the SERVICE_ROLE key to bypass RLS so the server can read all tasks globally
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Fetch all pending tasks that need to be done today (or are overdue)
    // Adjust 'plant_tasks' and column names to match your actual schema
    const { data: pendingTasks, error: taskError } = await supabase
      .from("plant_tasks")
      .select("id, user_id, task_name")
      .eq("is_completed", false);
    // In a real app, you might also add: .lte("due_date", new Date().toISOString())

    if (taskError) throw taskError;

    if (!pendingTasks || pendingTasks.length === 0) {
      return new Response(
        JSON.stringify({ message: "No tasks to notify today." }),
        { status: 200 },
      );
    }

    // 3. Group the tasks by user_id
    // This turns a flat list of 10 tasks into a neat dictionary organized by user
    const tasksByUser = pendingTasks.reduce((acc: any, task) => {
      if (!acc[task.user_id]) acc[task.user_id] = [];
      acc[task.user_id].push(task);
      return acc;
    }, {});

    // 4. Create the summary notifications for the `notifications` table
    const notificationsToInsert = [];
    const taskIdsToMarkNotified = []; // Optional: Keep track of what we warned them about

    for (const [userId, tasks] of Object.entries(tasksByUser)) {
      const taskList = tasks as any[];

      // If they only have 1 task, name it specifically. If more, group it.
      const title = "🌿 Good Morning!";
      const body =
        taskList.length === 1
          ? `Don't forget to ${taskList[0].task_name} today.`
          : `You have ${taskList.length} plant care tasks waiting for you today!`;

      notificationsToInsert.push({
        user_id: userId,
        title: title,
        body: body,
        // We can pass routing data so tapping the notification opens their schedule!
        data: { route: "/schedule", type: "daily_batch" },
        is_read: false,
      });

      taskList.forEach((t) => taskIdsToMarkNotified.push(t.id));
    }

    // 5. Insert the bundled messages into the notifications table
    // 🔥 MAGIC TRICK: This single insert will instantly trigger the 'push-webhook'
    // we built yesterday, delivering the messages to their phones!
    const { error: insertError } = await supabase
      .from("notifications")
      .insert(notificationsToInsert);

    if (insertError) throw insertError;

    console.log(
      `Successfully batched and sent notifications to ${Object.keys(tasksByUser).length} users.`,
    );
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Batch Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
});
