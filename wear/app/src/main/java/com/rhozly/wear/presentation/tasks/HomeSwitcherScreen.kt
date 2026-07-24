package com.rhozly.wear.presentation.tasks

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import com.rhozly.wear.data.model.HomeOption

/** Pick which home the watch shows. The active one is highlighted. */
@Composable
fun HomeSwitcherScreen(
    homes: List<HomeOption>,
    currentId: String?,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 24.dp),
    ) {
        item {
            Text(
                "Switch home",
                style = MaterialTheme.typography.title3,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = 2.dp),
            )
        }
        items(homes) { home ->
            Chip(
                onClick = { onSelect(home.id) },
                colors = if (home.id == currentId) ChipDefaults.primaryChipColors() else ChipDefaults.secondaryChipColors(),
                modifier = Modifier.fillMaxWidth(),
                label = { Text(home.name, maxLines = 2, overflow = TextOverflow.Ellipsis) },
            )
        }
        item { CompactChip(onClick = onDismiss, label = { Text("Cancel") }, colors = ChipDefaults.secondaryChipColors()) }
    }
}
