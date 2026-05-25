package ai.mechanical-wings.app.ui

import androidx.compose.runtime.Composable
import ai.mechanical-wings.app.MainViewModel
import ai.mechanical-wings.app.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
