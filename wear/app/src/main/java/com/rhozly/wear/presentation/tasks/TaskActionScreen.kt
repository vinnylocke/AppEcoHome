package com.rhozly.wear.presentation.tasks

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipColors
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import com.rhozly.wear.data.model.WatchTask

private enum class ActionMode { MENU, POSTPONE, DELETE, DELETE_SERIES }

/**
 * Tapping a task opens this. Complete is one tap; Postpone offers quick presets;
 * Delete asks to confirm, and for a recurring task offers "just this one" vs the
 * (gated, honest-worded) whole-schedule delete. Swipe-to-dismiss = Cancel.
 */
@Composable
fun TaskActionScreen(
    task: WatchTask,
    onComplete: () -> Unit,
    onPostpone: (days: Int) -> Unit,
    onDelete: (series: Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    var mode by remember { mutableStateOf(ActionMode.MENU) }
    val recurring = task.blueprintId != null
    val done = task.status == "Completed"

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 24.dp),
    ) {
        item {
            Text(
                task.title,
                style = MaterialTheme.typography.title3,
                textAlign = TextAlign.Center,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
            )
        }

        when (mode) {
            ActionMode.MENU -> {
                if (!done) {
                    item { ActionChip("✓ Complete", ChipDefaults.primaryChipColors(), onComplete) }
                    item { ActionChip("⏰ Postpone", ChipDefaults.secondaryChipColors()) { mode = ActionMode.POSTPONE } }
                }
                item { ActionChip("🗑 Delete", ChipDefaults.secondaryChipColors()) { mode = ActionMode.DELETE } }
                item { CancelChip("Cancel", onDismiss) }
            }

            ActionMode.POSTPONE -> {
                item { Label("Postpone to…") }
                item { ActionChip("+1 day", ChipDefaults.secondaryChipColors()) { onPostpone(1) } }
                item { ActionChip("+3 days", ChipDefaults.secondaryChipColors()) { onPostpone(3) } }
                item { ActionChip("+1 week", ChipDefaults.secondaryChipColors()) { onPostpone(7) } }
                item { CancelChip("Back") { mode = ActionMode.MENU } }
            }

            ActionMode.DELETE -> {
                if (recurring) {
                    item { Label("Delete…") }
                    item { ActionChip("Just this one", ChipDefaults.secondaryChipColors()) { onDelete(false) } }
                    item { ActionChip("Whole schedule", destructiveColors()) { mode = ActionMode.DELETE_SERIES } }
                    item { CancelChip("Back") { mode = ActionMode.MENU } }
                } else {
                    item { Label("Delete this task?") }
                    item { ActionChip("Delete", destructiveColors(), onClick = { onDelete(false) }) }
                    item { CancelChip("Back") { mode = ActionMode.MENU } }
                }
            }

            ActionMode.DELETE_SERIES -> {
                item {
                    Text(
                        "Delete the whole schedule? Every task in it — past and future, including history — is removed. This can't be undone.",
                        style = MaterialTheme.typography.caption2,
                        color = MaterialTheme.colors.error,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    )
                }
                item { ActionChip("Delete everything", destructiveColors()) { onDelete(true) } }
                item { CancelChip("Keep it") { mode = ActionMode.MENU } }
            }
        }
    }
}

@Composable
private fun destructiveColors(): ChipColors =
    ChipDefaults.primaryChipColors(
        backgroundColor = MaterialTheme.colors.error,
        contentColor = MaterialTheme.colors.onError,
    )

@Composable
private fun ActionChip(label: String, colors: ChipColors, onClick: () -> Unit) {
    Chip(
        onClick = onClick,
        label = { Text(label) },
        colors = colors,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun CancelChip(label: String, onClick: () -> Unit) {
    CompactChip(
        onClick = onClick,
        label = { Text(label) },
        colors = ChipDefaults.secondaryChipColors(),
    )
}

@Composable
private fun Label(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.caption1,
        color = MaterialTheme.colors.onSurface.copy(alpha = 0.7f),
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(bottom = 2.dp),
    )
}
