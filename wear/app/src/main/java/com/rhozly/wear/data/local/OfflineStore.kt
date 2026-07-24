package com.rhozly.wear.data.local

import android.content.Context
import com.rhozly.wear.data.Prefs
import com.rhozly.wear.data.model.HomeOption
import com.rhozly.wear.data.model.WatchTask
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * The offline facade over Room + Prefs. Days + the write queue live in Room;
 * the small homes list lives in Prefs (JSON). Serialisation of the cached task
 * lists / homes uses kotlinx.serialization (WatchTask / HomeOption are @Serializable).
 */
object OfflineStore {
    private val json = Json { ignoreUnknownKeys = true }

    @Volatile private var _db: AppDatabase? = null
    private val db: AppDatabase get() = _db ?: error("OfflineStore.init(context) not called")

    fun init(context: Context) { if (_db == null) _db = AppDatabase.get(context) }

    // ── Day cache ────────────────────────────────────────────────────────────
    suspend fun cacheDay(homeId: String, date: String, tasks: List<WatchTask>) {
        db.dayCache().put(DayCacheEntity(homeId, date, json.encodeToString(tasks), System.currentTimeMillis()))
    }

    suspend fun cachedDay(homeId: String, date: String): List<WatchTask>? {
        val e = db.dayCache().get(homeId, date) ?: return null
        return runCatching { json.decodeFromString<List<WatchTask>>(e.tasksJson) }.getOrNull()
    }

    // ── Homes cache (Prefs) ──────────────────────────────────────────────────
    fun cacheHomes(homes: List<HomeOption>) { Prefs.homesJson = json.encodeToString(homes) }

    fun cachedHomes(): List<HomeOption> =
        Prefs.homesJson?.let { runCatching { json.decodeFromString<List<HomeOption>>(it) }.getOrNull() } ?: emptyList()

    // ── Pending write queue (used from Phase 6b) ─────────────────────────────
    fun pendingCountFlow(): Flow<Int> = db.pendingWrites().countFlow()
    suspend fun enqueue(e: PendingWriteEntity) = db.pendingWrites().put(e)
    suspend fun pending(): List<PendingWriteEntity> = db.pendingWrites().all()
    suspend fun deletePending(id: String) = db.pendingWrites().delete(id)
    suspend fun bumpPending(id: String, err: String?) = db.pendingWrites().bumpAttempt(id, err)

    /** On sign-out: wipe cache + queue + prefs so the next account starts clean. */
    suspend fun clearAll() {
        db.dayCache().clear()
        db.pendingWrites().clear()
        Prefs.clearAll()
    }
}
