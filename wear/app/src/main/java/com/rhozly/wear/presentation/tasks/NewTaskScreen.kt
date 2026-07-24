package com.rhozly.wear.presentation.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** The five task categories the app offers (mirrors src/constants/taskCategories). */
private val TASK_TYPES = listOf("Watering", "Pruning", "Harvesting", "Maintenance", "Planting")

private enum class NewTaskMode { MAIN, TYPE }

/**
 * The "New task" editor shown after the title is spoken. Lets the user set the
 * type (sub-picker), the date (‹ / › stepper), and an optional voice note, then
 * Save. All draft state is owned by the caller (rememberSaveable) so it survives
 * the ViewModel/activity recreation a voice launch can trigger.
 */
@Composable
fun NewTaskScreen(
    title: String,
    type: String,
    dateStr: String,
    note: String,
    onReRecordTitle: () -> Unit,
    onTypeChange: (String) -> Unit,
    onDateChange: (String) -> Unit,
    onAddNote: () -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
) {
    var mode by remember { mutableStateOf(NewTaskMode.MAIN) }
    val date = runCatching { LocalDate.parse(dateStr) }.getOrDefault(LocalDate.now())

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 24.dp),
    ) {
        item {
            Text(
                "New task",
                style = MaterialTheme.typography.title3,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = 2.dp),
            )
        }

        when (mode) {
            NewTaskMode.MAIN -> {
                item {
                    Chip(
                        onClick = onReRecordTitle,
                        colors = ChipDefaults.primaryChipColors(),
                        modifier = Modifier.fillMaxWidth(),
                        label = {
                            Text(
                                title.ifBlank { "Tap to speak a task" },
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                        secondaryLabel = { Text("🎤 Tap to re-record") },
                    )
                }

                item { Label("Type") }
                item {
                    Chip(
                        onClick = { mode = NewTaskMode.TYPE },
                        colors = ChipDefaults.secondaryChipColors(),
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(type) },
                        secondaryLabel = { Text("Tap to change") },
                    )
                }

                item { Label("When") }
                item {
                    DateStepper(
                        date = date,
                        onPrev = { onDateChange(date.minusDays(1).toString()) },
                        onNext = { onDateChange(date.plusDays(1).toString()) },
                    )
                }

                item { Label("Note") }
                item {
                    Chip(
                        onClick = onAddNote,
                        colors = ChipDefaults.secondaryChipColors(),
                        modifier = Modifier.fillMaxWidth(),
                        label = {
                            Text(
                                if (note.isBlank()) "＋ Add note" else note,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                        secondaryLabel = if (note.isBlank()) null else {
                            { Text("🎤 Tap to change") }
                        },
                    )
                }

                item {
                    Chip(
                        onClick = onSave,
                        colors = ChipDefaults.primaryChipColors(),
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        label = { Text("✓ Save task") },
                    )
                }
                item { CompactChip(onClick = onCancel, label = { Text("Cancel") }, colors = ChipDefaults.secondaryChipColors()) }
            }

            NewTaskMode.TYPE -> {
                item { Label("Choose a type") }
                items(TASK_TYPES) { t ->
                    Chip(
                        onClick = { onTypeChange(t); mode = NewTaskMode.MAIN },
                        colors = if (t == type) ChipDefaults.primaryChipColors() else ChipDefaults.secondaryChipColors(),
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(t) },
                    )
                }
                item { CompactChip(onClick = { mode = NewTaskMode.MAIN }, label = { Text("Back") }, colors = ChipDefaults.secondaryChipColors()) }
            }
        }
    }
}

@Composable
private fun DateStepper(date: LocalDate, onPrev: () -> Unit, onNext: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Button(onClick = onPrev, colors = ButtonDefaults.secondaryButtonColors(), modifier = Modifier.size(34.dp)) {
            Text("‹", style = MaterialTheme.typography.title3)
        }
        Text(
            date.format(DateTimeFormatter.ofPattern("EEE, MMM d")),
            style = MaterialTheme.typography.title3,
            textAlign = TextAlign.Center,
        )
        Button(onClick = onNext, colors = ButtonDefaults.secondaryButtonColors(), modifier = Modifier.size(34.dp)) {
            Text("›", style = MaterialTheme.typography.title3)
        }
    }
}

@Composable
private fun Label(text: String) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.caption2,
        color = MaterialTheme.colors.onSurface.copy(alpha = 0.6f),
        textAlign = TextAlign.Start,
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 1.dp),
    )
}
