package com.rhozly.wear.data

import com.rhozly.wear.data.model.MutateResult
import com.rhozly.wear.data.model.TodayTasksResponse
import com.rhozly.wear.data.model.WatchTask
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.ktor.client.call.body
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Reads task data via the get-today-tasks edge function (which resolves ghosts
 * server-side). If any postgrest/functions call signature differs on the pinned
 * supabase-kt version, the fixes are localised here.
 */
object TasksRepository {

    @Serializable
    private data class HomeRow(val home_id: String? = null)

    @Serializable
    private data class NewTaskRow(
        val home_id: String,
        val title: String,
        val type: String,
        val description: String?,
        val due_date: String,
        val status: String,
        val scope: String,
        val created_by: String?,
    )

    @Serializable
    private data class NewEventRow(
        val user_id: String,
        val event_type: String,
        val meta: JsonObject,
    )

    /** The user's active home (`user_profiles.home_id`), or null. */
    suspend fun activeHomeId(): String? {
        val userId = Supabase.client.auth.currentUserOrNull()?.id ?: return null
        return Supabase.client.from("user_profiles")
            .select(Columns.list("home_id")) {
                filter { eq("uid", userId) }
            }
            .decodeSingleOrNull<HomeRow>()
            ?.home_id
    }

    /** A given day's tasks (all statuses) for a home via get-today-tasks.
     *  `today` drives the overdue carry when `date` == today. */
    suspend fun dayTasks(homeId: String, date: String, today: String): TodayTasksResponse {
        val response = Supabase.client.functions.invoke("get-today-tasks") {
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    put("home_id", homeId)
                    put("date", date)
                    put("today", today)
                },
            )
        }
        return response.body()
    }

    // ── Writes (mutate-task) ─────────────────────────────────────────────────
    // The server resolves ghosts, replicates the exact browser branch logic,
    // emits the pattern-engine event, and enforces auth/scope. The watch only
    // sends the action + the task fields it already has in hand.

    /** Mark a task done. */
    suspend fun complete(task: WatchTask, homeId: String): MutateResult =
        mutate(homeId, "complete", task) {}

    /** Move a task to `newDate` (YYYY-MM-DD). */
    suspend fun postpone(task: WatchTask, homeId: String, newDate: String): MutateResult =
        mutate(homeId, "postpone", task) { put("new_date", newDate) }

    /** Dismiss a task; `series=true` also deletes the whole recurring schedule. */
    suspend fun deleteTask(task: WatchTask, homeId: String, series: Boolean): MutateResult =
        mutate(homeId, "delete", task) { put("delete_series", series) }

    /** Create a one-off task for this home. Mirrors the app's quick-add: home
     *  scope, a direct RLS-gated insert (the watch's own session), plus a
     *  fire-and-forget `task_created` event. No ghost/branch logic, so it
     *  doesn't need the service-role mutate-task fn. */
    suspend fun addTask(
        homeId: String,
        title: String,
        type: String,
        dueDate: String,
        description: String?,
    ): MutateResult {
        val userId = Supabase.client.auth.currentUserOrNull()?.id
        Supabase.client.from("tasks").insert(
            NewTaskRow(
                home_id = homeId,
                title = title,
                type = type,
                description = description,
                due_date = dueDate,
                status = "Pending",
                scope = "home",
                created_by = userId,
            ),
        )
        if (userId != null) {
            runCatching {
                Supabase.client.from("user_events").insert(
                    NewEventRow(
                        user_id = userId,
                        event_type = "task_created",
                        meta = buildJsonObject {
                            put("type", type)
                            put("source", "wear")
                        },
                    ),
                )
            }
        }
        return MutateResult(ok = true, hint = "Task added")
    }

    private suspend fun mutate(
        homeId: String,
        action: String,
        task: WatchTask,
        extra: JsonObjectBuilder.() -> Unit,
    ): MutateResult {
        val response = Supabase.client.functions.invoke("mutate-task") {
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    put("home_id", homeId)
                    put("action", action)
                    putJsonObject("task") {
                        put("id", task.id)
                        put("is_ghost", task.isGhost)
                        task.blueprintId?.let { put("blueprint_id", it) }
                        put("due_date", task.dueDate)
                        task.type?.let { put("type", it) }
                        put("status", task.status)
                        task.windowEndDate?.let { put("window_end_date", it) }
                    }
                    extra()
                },
            )
        }
        return response.body()
    }
}
