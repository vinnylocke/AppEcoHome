package com.rhozly.wear.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/** One home+day's resolved task list (serialized), for offline reads. */
@Entity(tableName = "day_cache", primaryKeys = ["homeId", "date"])
data class DayCacheEntity(
    val homeId: String,
    val date: String, // YYYY-MM-DD
    val tasksJson: String, // serialized List<WatchTask>
    val cachedAt: Long,
)

@Dao
interface DayCacheDao {
    @Query("SELECT * FROM day_cache WHERE homeId = :homeId AND date = :date LIMIT 1")
    suspend fun get(homeId: String, date: String): DayCacheEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(entity: DayCacheEntity)

    @Query("DELETE FROM day_cache")
    suspend fun clear()
}

/** A durable offline mutation, replayed by SyncWorker when back online. */
@Entity(tableName = "pending_write")
data class PendingWriteEntity(
    @PrimaryKey val id: String,
    val userId: String?,
    val homeId: String,
    val action: String, // complete | postpone | delete | add
    val payloadJson: String,
    val createdAt: Long,
    val attempts: Int = 0,
    val lastError: String? = null,
)

@Dao
interface PendingWriteDao {
    @Query("SELECT * FROM pending_write ORDER BY createdAt ASC")
    suspend fun all(): List<PendingWriteEntity>

    @Query("SELECT COUNT(*) FROM pending_write")
    fun countFlow(): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(entity: PendingWriteEntity)

    @Query("DELETE FROM pending_write WHERE id = :id")
    suspend fun delete(id: String)

    @Query("UPDATE pending_write SET attempts = attempts + 1, lastError = :err WHERE id = :id")
    suspend fun bumpAttempt(id: String, err: String?)

    @Query("DELETE FROM pending_write")
    suspend fun clear()
}
