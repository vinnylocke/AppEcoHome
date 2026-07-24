package com.rhozly.wear.presentation.tasks

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.pullrefresh.PullRefreshState
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import com.rhozly.wear.data.model.WatchTask
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * A day view you can page through (‹ / ›), with a "Back to today" shortcut,
 * showing Overdue / To-do / Done. Tapping a task opens [TaskActionScreen]
 * (Complete / Postpone / Delete). Pull down to force a reconnect + sync.
 */
@OptIn(ExperimentalMaterialApi::class)
@Composable
fun TasksScreen(vm: TasksViewModel, onSignOut: () -> Unit) {
    val ui by vm.ui.collectAsState()
    var selected by remember { mutableStateOf<WatchTask?>(null) }
    var showHomes by remember { mutableStateOf(false) }

    // New-task draft. rememberSaveable so it survives the ViewModel/activity
    // recreation a voice launch can trigger. `capturing` = which field the
    // current voice capture fills ("title" | "note").
    var draftActive by rememberSaveable { mutableStateOf(false) }
    var draftTitle by rememberSaveable { mutableStateOf("") }
    var draftType by rememberSaveable { mutableStateOf("Maintenance") }
    var draftDate by rememberSaveable { mutableStateOf("") }
    var draftNote by rememberSaveable { mutableStateOf("") }
    var capturing by rememberSaveable { mutableStateOf<String?>(null) }

    val voiceLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val field = capturing
        capturing = null
        if (result.resultCode == Activity.RESULT_OK && field != null) {
            val spoken = result.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()?.trim().orEmpty()
            when (field) {
                "title" -> {
                    if (spoken.isEmpty()) {
                        if (!draftActive) vm.flash("Didn't catch that — try again")
                    } else {
                        draftTitle = spoken
                        if (!draftActive) {
                            draftType = "Maintenance"
                            draftDate = vm.viewedDateString()
                            draftNote = ""
                            draftActive = true
                        }
                    }
                }
                "note" -> if (spoken.isNotEmpty()) draftNote = spoken
            }
        }
    }
    fun captureVoice(field: String) {
        capturing = field
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
            )
            putExtra(RecognizerIntent.EXTRA_PROMPT, if (field == "note") "Add a note" else "Say the task")
        }
        runCatching { voiceLauncher.launch(intent) }
    }
    fun closeDraft() {
        draftActive = false
        draftTitle = ""
        draftNote = ""
        draftType = "Maintenance"
    }

    // The New-task editor takes over the screen while active.
    if (draftActive) {
        NewTaskScreen(
            title = draftTitle,
            type = draftType,
            dateStr = draftDate,
            note = draftNote,
            onReRecordTitle = { captureVoice("title") },
            onTypeChange = { draftType = it },
            onDateChange = { draftDate = it },
            onAddNote = { captureVoice("note") },
            onSave = { vm.saveNewTask(draftTitle, draftType, draftDate, draftNote); closeDraft() },
            onCancel = { closeDraft() },
        )
        return
    }

    // Tapping a task swaps in its action screen; swipe-to-dismiss / Cancel clears it.
    val sel = selected
    if (sel != null) {
        TaskActionScreen(
            task = sel,
            onComplete = { vm.complete(sel); selected = null },
            onPostpone = { days -> vm.postpone(sel, days); selected = null },
            onDelete = { series -> vm.deleteTask(sel, series); selected = null },
            onDismiss = { selected = null },
        )
        return
    }

    if (showHomes) {
        HomeSwitcherScreen(
            homes = ui.homes,
            currentId = ui.activeHomeId,
            onSelect = { id -> vm.selectHome(id); showHomes = false },
            onDismiss = { showHomes = false },
        )
        return
    }

    // Auto-clear the transient toast (a "finish on phone" hint or an action error).
    LaunchedEffect(ui.message) {
        if (ui.message != null) {
            delay(2500)
            vm.clearMessage()
        }
    }

    // Partition once per task-list change, not on every recomposition (each
    // pull-to-refresh frame previously re-ran three .filter passes) — a real
    // scroll/jank cost on-device.
    val overdueTasks = remember(ui.tasks) { ui.tasks.filter { it.overdue } }
    val todoTasks = remember(ui.tasks) { ui.tasks.filter { !it.overdue && it.status == "Pending" } }
    val doneTasks = remember(ui.tasks) { ui.tasks.filter { it.status == "Completed" } }

    val pullState = rememberPullRefreshState(refreshing = ui.refreshing, onRefresh = vm::refresh)
    Box(Modifier.fillMaxSize().pullRefresh(pullState)) {
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 24.dp),
    ) {
        if (ui.homes.size > 1) {
            item {
                // Home switcher — only when the user is in more than one home.
                CompactChip(
                    onClick = { showHomes = true },
                    label = { Text("🏠 " + (ui.homeName ?: "Home")) },
                    colors = ChipDefaults.secondaryChipColors(),
                )
            }
        }

        item { DayHeader(ui.date, ui.isToday, vm::goPrevDay, vm::goNextDay) }

        item {
            // Voice-first add; speak the title → the New-task editor opens.
            // Compact/centered so it reads as a control, not a task.
            CompactChip(
                onClick = { captureVoice("title") },
                label = { Text("＋ Add task") },
                colors = ChipDefaults.primaryChipColors(),
            )
        }

        ui.message?.let { msg ->
            item {
                Text(
                    msg,
                    style = MaterialTheme.typography.caption2,
                    color = MaterialTheme.colors.primary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                )
            }
        }

        if (ui.offline || ui.queuedCount > 0) {
            item {
                val label = buildString {
                    if (ui.offline) append("⚡ Offline")
                    if (ui.queuedCount > 0) {
                        if (isNotEmpty()) append("  ·  ")
                        append("⟳ ${ui.queuedCount} queued")
                    }
                }
                Text(
                    label,
                    style = MaterialTheme.typography.caption2,
                    color = MaterialTheme.colors.onSurface.copy(alpha = 0.6f),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 1.dp),
                )
            }
        }

        if (!ui.isToday) {
            item {
                // A compact, auto-width pill (NOT full-width) so it reads as a
                // control, not a task row.
                CompactChip(
                    onClick = vm::goToday,
                    label = { Text("↩ Today") },
                    colors = ChipDefaults.secondaryChipColors(),
                )
            }
        }

        when {
            ui.loading -> item {
                CircularProgressIndicator(modifier = Modifier.padding(top = 8.dp))
            }
            ui.error != null -> {
                item {
                    Text(
                        ui.error!!,
                        style = MaterialTheme.typography.caption2,
                        color = MaterialTheme.colors.error,
                        textAlign = TextAlign.Center,
                    )
                }
                item {
                    Chip(
                        onClick = vm::reload,
                        label = { Text("Retry") },
                        colors = ChipDefaults.secondaryChipColors(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            ui.tasks.isEmpty() -> item {
                Text(
                    when {
                        ui.notCached -> "This day isn't cached — go online to load it"
                        ui.isToday -> "Nothing due today"
                        else -> "Nothing on this day"
                    },
                    style = MaterialTheme.typography.caption1,
                    color = MaterialTheme.colors.onSurface.copy(alpha = 0.7f),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            else -> {
                if (overdueTasks.isNotEmpty()) {
                    item { SectionLabel("Overdue", MaterialTheme.colors.error) }
                    items(overdueTasks, key = { it.id }) { task -> TaskChip(task) { selected = task } }
                }
                if (todoTasks.isNotEmpty()) {
                    item { SectionLabel("To do") }
                    items(todoTasks, key = { it.id }) { task -> TaskChip(task) { selected = task } }
                }
                if (doneTasks.isNotEmpty()) {
                    item { SectionLabel("Done") }
                    items(doneTasks, key = { it.id }) { task -> TaskChip(task) { selected = task } }
                }
            }
        }

        item {
            Chip(
                onClick = onSignOut,
                label = { Text("Sign out") },
                colors = ChipDefaults.secondaryChipColors(),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

        // Pull-to-refresh spinner. Extracted so the per-frame pullState.progress
        // read recomposes only this indicator, not the whole task list.
        PullSpinner(ui.refreshing, pullState)
    }
}

/** Top pull-to-refresh spinner. Reads pullState.progress in its OWN scope so a
 *  pull gesture doesn't recompose the entire ScalingLazyColumn every frame. */
@Composable
private fun BoxScope.PullSpinner(refreshing: Boolean, pullState: PullRefreshState) {
    if (refreshing || pullState.progress > 0f) {
        CircularProgressIndicator(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 4.dp)
                .size(22.dp),
        )
    }
}

@Composable
private fun DayHeader(date: LocalDate, isToday: Boolean, onPrev: () -> Unit, onNext: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Button(
            onClick = onPrev,
            colors = ButtonDefaults.secondaryButtonColors(),
            modifier = Modifier.size(34.dp),
        ) { Text("‹", style = MaterialTheme.typography.title3) }

        Text(
            dayLabel(date, isToday),
            style = MaterialTheme.typography.title3,
            textAlign = TextAlign.Center,
        )

        Button(
            onClick = onNext,
            colors = ButtonDefaults.secondaryButtonColors(),
            modifier = Modifier.size(34.dp),
        ) { Text("›", style = MaterialTheme.typography.title3) }
    }
}

private fun dayLabel(date: LocalDate, isToday: Boolean): String {
    if (isToday) return "Today"
    val today = LocalDate.now()
    return when (date) {
        today.plusDays(1) -> "Tomorrow"
        today.minusDays(1) -> "Yesterday"
        else -> date.format(DateTimeFormatter.ofPattern("EEE, MMM d"))
    }
}

@Composable
private fun SectionLabel(text: String, color: Color = MaterialTheme.colors.onSurface.copy(alpha = 0.6f)) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.caption2,
        color = color,
        textAlign = TextAlign.Start,
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 1.dp),
    )
}

@Composable
private fun TaskChip(task: WatchTask, onClick: () -> Unit) {
    val done = task.status == "Completed"
    Chip(
        onClick = onClick,
        colors = if (done) ChipDefaults.secondaryChipColors() else ChipDefaults.primaryChipColors(),
        modifier = Modifier.fillMaxWidth(),
        label = {
            Text(
                (if (done) "✓ " else "") + task.title,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        },
        secondaryLabel = task.type?.takeIf { it.isNotBlank() }?.let { t -> { Text(t) } },
    )
}
