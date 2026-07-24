package com.rhozly.wear.data.model

import kotlinx.serialization.Serializable

/**
 * The serialized args of a queued offline write, enough for SyncWorker to replay
 * it via TasksRepository. `action` (on the row) selects which fields matter:
 *   complete → task ; postpone → task + newDate ; delete → task + series ;
 *   add      → title + type + dueDate + description + clientId
 */
@Serializable
data class WritePayload(
    val task: WatchTask? = null,
    val newDate: String? = null, // postpone
    val series: Boolean = false, // delete
    val title: String? = null, // add
    val type: String? = null,
    val dueDate: String? = null,
    val description: String? = null,
    val clientId: String? = null, // add — client uuid for idempotent replay (upsert)
)
