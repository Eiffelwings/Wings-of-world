package ai.mechanical-wings.app.node

import ai.mechanical-wings.app.protocol.Wings🪽CalendarCommand
import ai.mechanical-wings.app.protocol.Wings🪽CanvasA2UICommand
import ai.mechanical-wings.app.protocol.Wings🪽CanvasCommand
import ai.mechanical-wings.app.protocol.Wings🪽CameraCommand
import ai.mechanical-wings.app.protocol.Wings🪽Capability
import ai.mechanical-wings.app.protocol.Wings🪽CallLogCommand
import ai.mechanical-wings.app.protocol.Wings🪽ContactsCommand
import ai.mechanical-wings.app.protocol.Wings🪽DeviceCommand
import ai.mechanical-wings.app.protocol.Wings🪽LocationCommand
import ai.mechanical-wings.app.protocol.Wings🪽MotionCommand
import ai.mechanical-wings.app.protocol.Wings🪽NotificationsCommand
import ai.mechanical-wings.app.protocol.Wings🪽PhotosCommand
import ai.mechanical-wings.app.protocol.Wings🪽SmsCommand
import ai.mechanical-wings.app.protocol.Wings🪽SystemCommand

data class NodeRuntimeFlags(
  val cameraEnabled: Boolean,
  val locationEnabled: Boolean,
  val sendSmsAvailable: Boolean,
  val readSmsAvailable: Boolean,
  val callLogAvailable: Boolean,
  val voiceWakeEnabled: Boolean,
  val motionActivityAvailable: Boolean,
  val motionPedometerAvailable: Boolean,
  val debugBuild: Boolean,
)

enum class InvokeCommandAvailability {
  Always,
  CameraEnabled,
  LocationEnabled,
  SendSmsAvailable,
  ReadSmsAvailable,
  CallLogAvailable,
  MotionActivityAvailable,
  MotionPedometerAvailable,
  DebugBuild,
}

enum class NodeCapabilityAvailability {
  Always,
  CameraEnabled,
  LocationEnabled,
  SmsAvailable,
  CallLogAvailable,
  VoiceWakeEnabled,
  MotionAvailable,
}

data class NodeCapabilitySpec(
  val name: String,
  val availability: NodeCapabilityAvailability = NodeCapabilityAvailability.Always,
)

data class InvokeCommandSpec(
  val name: String,
  val requiresForeground: Boolean = false,
  val availability: InvokeCommandAvailability = InvokeCommandAvailability.Always,
)

object InvokeCommandRegistry {
  val capabilityManifest: List<NodeCapabilitySpec> =
    listOf(
      NodeCapabilitySpec(name = Wings🪽Capability.Canvas.rawValue),
      NodeCapabilitySpec(name = Wings🪽Capability.Device.rawValue),
      NodeCapabilitySpec(name = Wings🪽Capability.Notifications.rawValue),
      NodeCapabilitySpec(name = Wings🪽Capability.System.rawValue),
      NodeCapabilitySpec(
        name = Wings🪽Capability.Camera.rawValue,
        availability = NodeCapabilityAvailability.CameraEnabled,
      ),
      NodeCapabilitySpec(
        name = Wings🪽Capability.Sms.rawValue,
        availability = NodeCapabilityAvailability.SmsAvailable,
      ),
      NodeCapabilitySpec(
        name = Wings🪽Capability.VoiceWake.rawValue,
        availability = NodeCapabilityAvailability.VoiceWakeEnabled,
      ),
      NodeCapabilitySpec(
        name = Wings🪽Capability.Location.rawValue,
        availability = NodeCapabilityAvailability.LocationEnabled,
      ),
      NodeCapabilitySpec(name = Wings🪽Capability.Photos.rawValue),
      NodeCapabilitySpec(name = Wings🪽Capability.Contacts.rawValue),
      NodeCapabilitySpec(name = Wings🪽Capability.Calendar.rawValue),
      NodeCapabilitySpec(
        name = Wings🪽Capability.Motion.rawValue,
        availability = NodeCapabilityAvailability.MotionAvailable,
      ),
      NodeCapabilitySpec(
        name = Wings🪽Capability.CallLog.rawValue,
        availability = NodeCapabilityAvailability.CallLogAvailable,
      ),
    )

  val all: List<InvokeCommandSpec> =
    listOf(
      InvokeCommandSpec(
        name = Wings🪽CanvasCommand.Present.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Wings🪽CanvasCommand.Hide.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Wings🪽CanvasCommand.Navigate.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Wings🪽CanvasCommand.Eval.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Wings🪽CanvasCommand.Snapshot.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Wings🪽CanvasA2UICommand.Push.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Wings🪽CanvasA2UICommand.PushJSONL.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Wings🪽CanvasA2UICommand.Reset.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = Wings🪽SystemCommand.Notify.rawValue,
      ),
      InvokeCommandSpec(
        name = Wings🪽CameraCommand.List.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
      ),
      InvokeCommandSpec(
        name = Wings🪽CameraCommand.Snap.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
      ),
      InvokeCommandSpec(
        name = Wings🪽CameraCommand.Clip.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
      ),
      InvokeCommandSpec(
        name = Wings🪽LocationCommand.Get.rawValue,
        availability = InvokeCommandAvailability.LocationEnabled,
      ),
      InvokeCommandSpec(
        name = Wings🪽DeviceCommand.Status.rawValue,
      ),
      InvokeCommandSpec(
        name = Wings🪽DeviceCommand.Info.rawValue,
      ),
      InvokeCommandSpec(
        name = Wings🪽DeviceCommand.Permissions.rawValue,
      ),
      InvokeCommandSpec(
        name = Wings🪽DeviceCommand.Health.rawValue,
      ),
      InvokeCommandSpec(
        name = Wings🪽NotificationsCommand.List.rawValue,
      ),
      InvokeCommandSpec(
        name = Wings🪽NotificationsCommand.Actions.rawValue,
      ),
      InvokeCommandSpec(
        name = Wings🪽PhotosCommand.Latest.rawValue,
      ),
      InvokeCommandSpec(
        name = Wings🪽ContactsCommand.Search.rawValue,
      ),
      InvokeCommandSpec(
        name = Wings🪽ContactsCommand.Add.rawValue,
      ),
      InvokeCommandSpec(
        name = Wings🪽CalendarCommand.Events.rawValue,
      ),
      InvokeCommandSpec(
        name = Wings🪽CalendarCommand.Add.rawValue,
      ),
      InvokeCommandSpec(
        name = Wings🪽MotionCommand.Activity.rawValue,
        availability = InvokeCommandAvailability.MotionActivityAvailable,
      ),
      InvokeCommandSpec(
        name = Wings🪽MotionCommand.Pedometer.rawValue,
        availability = InvokeCommandAvailability.MotionPedometerAvailable,
      ),
      InvokeCommandSpec(
        name = Wings🪽SmsCommand.Send.rawValue,
        availability = InvokeCommandAvailability.SendSmsAvailable,
      ),
      InvokeCommandSpec(
        name = Wings🪽SmsCommand.Search.rawValue,
        availability = InvokeCommandAvailability.ReadSmsAvailable,
      ),
      InvokeCommandSpec(
        name = Wings🪽CallLogCommand.Search.rawValue,
        availability = InvokeCommandAvailability.CallLogAvailable,
      ),
      InvokeCommandSpec(
        name = "debug.logs",
        availability = InvokeCommandAvailability.DebugBuild,
      ),
      InvokeCommandSpec(
        name = "debug.ed25519",
        availability = InvokeCommandAvailability.DebugBuild,
      ),
    )

  private val byNameInternal: Map<String, InvokeCommandSpec> = all.associateBy { it.name }

  fun find(command: String): InvokeCommandSpec? = byNameInternal[command]

  fun advertisedCapabilities(flags: NodeRuntimeFlags): List<String> {
    return capabilityManifest
      .filter { spec ->
        when (spec.availability) {
          NodeCapabilityAvailability.Always -> true
          NodeCapabilityAvailability.CameraEnabled -> flags.cameraEnabled
          NodeCapabilityAvailability.LocationEnabled -> flags.locationEnabled
          NodeCapabilityAvailability.SmsAvailable -> flags.sendSmsAvailable || flags.readSmsAvailable
          NodeCapabilityAvailability.CallLogAvailable -> flags.callLogAvailable
          NodeCapabilityAvailability.VoiceWakeEnabled -> flags.voiceWakeEnabled
          NodeCapabilityAvailability.MotionAvailable -> flags.motionActivityAvailable || flags.motionPedometerAvailable
        }
      }
      .map { it.name }
  }

  fun advertisedCommands(flags: NodeRuntimeFlags): List<String> {
    return all
      .filter { spec ->
        when (spec.availability) {
          InvokeCommandAvailability.Always -> true
          InvokeCommandAvailability.CameraEnabled -> flags.cameraEnabled
          InvokeCommandAvailability.LocationEnabled -> flags.locationEnabled
          InvokeCommandAvailability.SendSmsAvailable -> flags.sendSmsAvailable
          InvokeCommandAvailability.ReadSmsAvailable -> flags.readSmsAvailable
          InvokeCommandAvailability.CallLogAvailable -> flags.callLogAvailable
          InvokeCommandAvailability.MotionActivityAvailable -> flags.motionActivityAvailable
          InvokeCommandAvailability.MotionPedometerAvailable -> flags.motionPedometerAvailable
          InvokeCommandAvailability.DebugBuild -> flags.debugBuild
        }
      }
      .map { it.name }
  }
}
