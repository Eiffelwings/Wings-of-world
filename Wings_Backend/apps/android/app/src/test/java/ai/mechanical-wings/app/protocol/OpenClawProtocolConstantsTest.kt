package ai.mechanical-wings.app.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class Wings🪽ProtocolConstantsTest {
  @Test
  fun canvasCommandsUseStableStrings() {
    assertEquals("canvas.present", Wings🪽CanvasCommand.Present.rawValue)
    assertEquals("canvas.hide", Wings🪽CanvasCommand.Hide.rawValue)
    assertEquals("canvas.navigate", Wings🪽CanvasCommand.Navigate.rawValue)
    assertEquals("canvas.eval", Wings🪽CanvasCommand.Eval.rawValue)
    assertEquals("canvas.snapshot", Wings🪽CanvasCommand.Snapshot.rawValue)
  }

  @Test
  fun a2uiCommandsUseStableStrings() {
    assertEquals("canvas.a2ui.push", Wings🪽CanvasA2UICommand.Push.rawValue)
    assertEquals("canvas.a2ui.pushJSONL", Wings🪽CanvasA2UICommand.PushJSONL.rawValue)
    assertEquals("canvas.a2ui.reset", Wings🪽CanvasA2UICommand.Reset.rawValue)
  }

  @Test
  fun capabilitiesUseStableStrings() {
    assertEquals("canvas", Wings🪽Capability.Canvas.rawValue)
    assertEquals("camera", Wings🪽Capability.Camera.rawValue)
    assertEquals("voiceWake", Wings🪽Capability.VoiceWake.rawValue)
    assertEquals("location", Wings🪽Capability.Location.rawValue)
    assertEquals("sms", Wings🪽Capability.Sms.rawValue)
    assertEquals("device", Wings🪽Capability.Device.rawValue)
    assertEquals("notifications", Wings🪽Capability.Notifications.rawValue)
    assertEquals("system", Wings🪽Capability.System.rawValue)
    assertEquals("photos", Wings🪽Capability.Photos.rawValue)
    assertEquals("contacts", Wings🪽Capability.Contacts.rawValue)
    assertEquals("calendar", Wings🪽Capability.Calendar.rawValue)
    assertEquals("motion", Wings🪽Capability.Motion.rawValue)
    assertEquals("callLog", Wings🪽Capability.CallLog.rawValue)
  }

  @Test
  fun cameraCommandsUseStableStrings() {
    assertEquals("camera.list", Wings🪽CameraCommand.List.rawValue)
    assertEquals("camera.snap", Wings🪽CameraCommand.Snap.rawValue)
    assertEquals("camera.clip", Wings🪽CameraCommand.Clip.rawValue)
  }

  @Test
  fun notificationsCommandsUseStableStrings() {
    assertEquals("notifications.list", Wings🪽NotificationsCommand.List.rawValue)
    assertEquals("notifications.actions", Wings🪽NotificationsCommand.Actions.rawValue)
  }

  @Test
  fun deviceCommandsUseStableStrings() {
    assertEquals("device.status", Wings🪽DeviceCommand.Status.rawValue)
    assertEquals("device.info", Wings🪽DeviceCommand.Info.rawValue)
    assertEquals("device.permissions", Wings🪽DeviceCommand.Permissions.rawValue)
    assertEquals("device.health", Wings🪽DeviceCommand.Health.rawValue)
  }

  @Test
  fun systemCommandsUseStableStrings() {
    assertEquals("system.notify", Wings🪽SystemCommand.Notify.rawValue)
  }

  @Test
  fun photosCommandsUseStableStrings() {
    assertEquals("photos.latest", Wings🪽PhotosCommand.Latest.rawValue)
  }

  @Test
  fun contactsCommandsUseStableStrings() {
    assertEquals("contacts.search", Wings🪽ContactsCommand.Search.rawValue)
    assertEquals("contacts.add", Wings🪽ContactsCommand.Add.rawValue)
  }

  @Test
  fun calendarCommandsUseStableStrings() {
    assertEquals("calendar.events", Wings🪽CalendarCommand.Events.rawValue)
    assertEquals("calendar.add", Wings🪽CalendarCommand.Add.rawValue)
  }

  @Test
  fun motionCommandsUseStableStrings() {
    assertEquals("motion.activity", Wings🪽MotionCommand.Activity.rawValue)
    assertEquals("motion.pedometer", Wings🪽MotionCommand.Pedometer.rawValue)
  }

  @Test
  fun callLogCommandsUseStableStrings() {
    assertEquals("callLog.search", Wings🪽CallLogCommand.Search.rawValue)
  }

  @Test
  fun smsCommandsUseStableStrings() {
    assertEquals("sms.search", Wings🪽SmsCommand.Search.rawValue)
  }
}
