package ai.mechanical-wings.app.node

import ai.mechanical-wings.app.protocol.Wings🪽CalendarCommand
import ai.mechanical-wings.app.protocol.Wings🪽CameraCommand
import ai.mechanical-wings.app.protocol.Wings🪽CallLogCommand
import ai.mechanical-wings.app.protocol.Wings🪽Capability
import ai.mechanical-wings.app.protocol.Wings🪽ContactsCommand
import ai.mechanical-wings.app.protocol.Wings🪽DeviceCommand
import ai.mechanical-wings.app.protocol.Wings🪽LocationCommand
import ai.mechanical-wings.app.protocol.Wings🪽MotionCommand
import ai.mechanical-wings.app.protocol.Wings🪽NotificationsCommand
import ai.mechanical-wings.app.protocol.Wings🪽PhotosCommand
import ai.mechanical-wings.app.protocol.Wings🪽SmsCommand
import ai.mechanical-wings.app.protocol.Wings🪽SystemCommand
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InvokeCommandRegistryTest {
  private val coreCapabilities =
    setOf(
      Wings🪽Capability.Canvas.rawValue,
      Wings🪽Capability.Device.rawValue,
      Wings🪽Capability.Notifications.rawValue,
      Wings🪽Capability.System.rawValue,
      Wings🪽Capability.Photos.rawValue,
      Wings🪽Capability.Contacts.rawValue,
      Wings🪽Capability.Calendar.rawValue,
    )

  private val optionalCapabilities =
    setOf(
      Wings🪽Capability.Camera.rawValue,
      Wings🪽Capability.Location.rawValue,
      Wings🪽Capability.Sms.rawValue,
      Wings🪽Capability.CallLog.rawValue,
      Wings🪽Capability.VoiceWake.rawValue,
      Wings🪽Capability.Motion.rawValue,
    )

  private val coreCommands =
    setOf(
      Wings🪽DeviceCommand.Status.rawValue,
      Wings🪽DeviceCommand.Info.rawValue,
      Wings🪽DeviceCommand.Permissions.rawValue,
      Wings🪽DeviceCommand.Health.rawValue,
      Wings🪽NotificationsCommand.List.rawValue,
      Wings🪽NotificationsCommand.Actions.rawValue,
      Wings🪽SystemCommand.Notify.rawValue,
      Wings🪽PhotosCommand.Latest.rawValue,
      Wings🪽ContactsCommand.Search.rawValue,
      Wings🪽ContactsCommand.Add.rawValue,
      Wings🪽CalendarCommand.Events.rawValue,
      Wings🪽CalendarCommand.Add.rawValue,
    )

  private val optionalCommands =
    setOf(
      Wings🪽CameraCommand.Snap.rawValue,
      Wings🪽CameraCommand.Clip.rawValue,
      Wings🪽CameraCommand.List.rawValue,
      Wings🪽LocationCommand.Get.rawValue,
      Wings🪽MotionCommand.Activity.rawValue,
      Wings🪽MotionCommand.Pedometer.rawValue,
      Wings🪽SmsCommand.Send.rawValue,
      Wings🪽SmsCommand.Search.rawValue,
      Wings🪽CallLogCommand.Search.rawValue,
    )

  private val debugCommands = setOf("debug.logs", "debug.ed25519")

  @Test
  fun advertisedCapabilities_respectsFeatureAvailability() {
    val capabilities = InvokeCommandRegistry.advertisedCapabilities(defaultFlags())

    assertContainsAll(capabilities, coreCapabilities)
    assertMissingAll(capabilities, optionalCapabilities)
  }

  @Test
  fun advertisedCapabilities_includesFeatureCapabilitiesWhenEnabled() {
    val capabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          sendSmsAvailable = true,
          readSmsAvailable = true,
          callLogAvailable = true,
          voiceWakeEnabled = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
        ),
      )

    assertContainsAll(capabilities, coreCapabilities + optionalCapabilities)
  }

  @Test
  fun advertisedCommands_respectsFeatureAvailability() {
    val commands = InvokeCommandRegistry.advertisedCommands(defaultFlags())

    assertContainsAll(commands, coreCommands)
    assertMissingAll(commands, optionalCommands + debugCommands)
  }

  @Test
  fun advertisedCommands_includesFeatureCommandsWhenEnabled() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          sendSmsAvailable = true,
          readSmsAvailable = true,
          callLogAvailable = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
          debugBuild = true,
        ),
      )

    assertContainsAll(commands, coreCommands + optionalCommands + debugCommands)
  }

  @Test
  fun advertisedCommands_onlyIncludesSupportedMotionCommands() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        NodeRuntimeFlags(
          cameraEnabled = false,
          locationEnabled = false,
          sendSmsAvailable = false,
          readSmsAvailable = false,
          callLogAvailable = false,
          voiceWakeEnabled = false,
          motionActivityAvailable = true,
          motionPedometerAvailable = false,
          debugBuild = false,
        ),
      )

    assertTrue(commands.contains(Wings🪽MotionCommand.Activity.rawValue))
    assertFalse(commands.contains(Wings🪽MotionCommand.Pedometer.rawValue))
  }

  @Test
  fun advertisedCommands_splitsSmsSendAndSearchAvailability() {
    val readOnlyCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(readSmsAvailable = true),
      )
    val sendOnlyCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(sendSmsAvailable = true),
      )

    assertTrue(readOnlyCommands.contains(Wings🪽SmsCommand.Search.rawValue))
    assertFalse(readOnlyCommands.contains(Wings🪽SmsCommand.Send.rawValue))
    assertTrue(sendOnlyCommands.contains(Wings🪽SmsCommand.Send.rawValue))
    assertFalse(sendOnlyCommands.contains(Wings🪽SmsCommand.Search.rawValue))
  }

  @Test
  fun advertisedCapabilities_includeSmsWhenEitherSmsPathIsAvailable() {
    val readOnlyCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(readSmsAvailable = true),
      )
    val sendOnlyCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(sendSmsAvailable = true),
      )

    assertTrue(readOnlyCapabilities.contains(Wings🪽Capability.Sms.rawValue))
    assertTrue(sendOnlyCapabilities.contains(Wings🪽Capability.Sms.rawValue))
  }

  @Test
  fun advertisedCommands_excludesCallLogWhenUnavailable() {
    val commands = InvokeCommandRegistry.advertisedCommands(defaultFlags(callLogAvailable = false))

    assertFalse(commands.contains(Wings🪽CallLogCommand.Search.rawValue))
  }

  @Test
  fun advertisedCapabilities_excludesCallLogWhenUnavailable() {
    val capabilities = InvokeCommandRegistry.advertisedCapabilities(defaultFlags(callLogAvailable = false))

    assertFalse(capabilities.contains(Wings🪽Capability.CallLog.rawValue))
  }

  private fun defaultFlags(
    cameraEnabled: Boolean = false,
    locationEnabled: Boolean = false,
    sendSmsAvailable: Boolean = false,
    readSmsAvailable: Boolean = false,
    callLogAvailable: Boolean = false,
    voiceWakeEnabled: Boolean = false,
    motionActivityAvailable: Boolean = false,
    motionPedometerAvailable: Boolean = false,
    debugBuild: Boolean = false,
  ): NodeRuntimeFlags =
    NodeRuntimeFlags(
      cameraEnabled = cameraEnabled,
      locationEnabled = locationEnabled,
      sendSmsAvailable = sendSmsAvailable,
      readSmsAvailable = readSmsAvailable,
      callLogAvailable = callLogAvailable,
      voiceWakeEnabled = voiceWakeEnabled,
      motionActivityAvailable = motionActivityAvailable,
      motionPedometerAvailable = motionPedometerAvailable,
      debugBuild = debugBuild,
    )

  private fun assertContainsAll(actual: List<String>, expected: Set<String>) {
    expected.forEach { value -> assertTrue(actual.contains(value)) }
  }

  private fun assertMissingAll(actual: List<String>, forbidden: Set<String>) {
    forbidden.forEach { value -> assertFalse(actual.contains(value)) }
  }
}
