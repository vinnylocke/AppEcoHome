package com.rhozly.wear.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** One task as returned by the get-today-tasks edge function. */
@Serializable
data class WatchTask(
    val id: String,
    @SerialName("blueprint_id") val blueprintId: String? = null,
    val title: String,
    val type: String? = null,
    @SerialName("due_date") val dueDate: String,
    val status: String,
    @SerialName("is_ghost") val isGhost: Boolean = false,
    @SerialName("window_end_date") val windowEndDate: String? = null,
    val overdue: Boolean = false,
)

/** The get-today-tasks response envelope. */
@Serializable
data class TodayTasksResponse(
    val tasks: List<WatchTask> = emptyList(),
    @SerialName("home_id") val homeId: String? = null,
    val date: String? = null,
    val today: String? = null,
)

/** The mutate-task response. `hint` is a "finish on phone" note (Planting/Harvest). */
@Serializable
data class MutateResult(
    val ok: Boolean = false,
    val hint: String? = null,
    val error: String? = null,
)
