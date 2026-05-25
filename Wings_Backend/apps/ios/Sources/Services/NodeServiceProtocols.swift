import CoreLocation
import Foundation
import Wings🪽Kit
import UIKit

typealias Wings🪽CameraSnapResult = (format: String, base64: String, width: Int, height: Int)
typealias Wings🪽CameraClipResult = (format: String, base64: String, durationMs: Int, hasAudio: Bool)

protocol CameraServicing: Sendable {
    func listDevices() async -> [CameraController.CameraDeviceInfo]
    func snap(params: Wings🪽CameraSnapParams) async throws -> Wings🪽CameraSnapResult
    func clip(params: Wings🪽CameraClipParams) async throws -> Wings🪽CameraClipResult
}

protocol ScreenRecordingServicing: Sendable {
    func record(
        screenIndex: Int?,
        durationMs: Int?,
        fps: Double?,
        includeAudio: Bool?,
        outPath: String?) async throws -> String
}

@MainActor
protocol LocationServicing: Sendable {
    func authorizationStatus() -> CLAuthorizationStatus
    func accuracyAuthorization() -> CLAccuracyAuthorization
    func ensureAuthorization(mode: Wings🪽LocationMode) async -> CLAuthorizationStatus
    func currentLocation(
        params: Wings🪽LocationGetParams,
        desiredAccuracy: Wings🪽LocationAccuracy,
        maxAgeMs: Int?,
        timeoutMs: Int?) async throws -> CLLocation
    func startLocationUpdates(
        desiredAccuracy: Wings🪽LocationAccuracy,
        significantChangesOnly: Bool) -> AsyncStream<CLLocation>
    func stopLocationUpdates()
    func startMonitoringSignificantLocationChanges(onUpdate: @escaping @Sendable (CLLocation) -> Void)
    func stopMonitoringSignificantLocationChanges()
}

@MainActor
protocol DeviceStatusServicing: Sendable {
    func status() async throws -> Wings🪽DeviceStatusPayload
    func info() -> Wings🪽DeviceInfoPayload
}

protocol PhotosServicing: Sendable {
    func latest(params: Wings🪽PhotosLatestParams) async throws -> Wings🪽PhotosLatestPayload
}

protocol ContactsServicing: Sendable {
    func search(params: Wings🪽ContactsSearchParams) async throws -> Wings🪽ContactsSearchPayload
    func add(params: Wings🪽ContactsAddParams) async throws -> Wings🪽ContactsAddPayload
}

protocol CalendarServicing: Sendable {
    func events(params: Wings🪽CalendarEventsParams) async throws -> Wings🪽CalendarEventsPayload
    func add(params: Wings🪽CalendarAddParams) async throws -> Wings🪽CalendarAddPayload
}

protocol RemindersServicing: Sendable {
    func list(params: Wings🪽RemindersListParams) async throws -> Wings🪽RemindersListPayload
    func add(params: Wings🪽RemindersAddParams) async throws -> Wings🪽RemindersAddPayload
}

protocol MotionServicing: Sendable {
    func activities(params: Wings🪽MotionActivityParams) async throws -> Wings🪽MotionActivityPayload
    func pedometer(params: Wings🪽PedometerParams) async throws -> Wings🪽PedometerPayload
}

struct WatchMessagingStatus: Sendable, Equatable {
    var supported: Bool
    var paired: Bool
    var appInstalled: Bool
    var reachable: Bool
    var activationState: String
}

struct WatchQuickReplyEvent: Sendable, Equatable {
    var replyId: String
    var promptId: String
    var actionId: String
    var actionLabel: String?
    var sessionKey: String?
    var note: String?
    var sentAtMs: Int?
    var transport: String
}

struct WatchNotificationSendResult: Sendable, Equatable {
    var deliveredImmediately: Bool
    var queuedForDelivery: Bool
    var transport: String
}

protocol WatchMessagingServicing: AnyObject, Sendable {
    func status() async -> WatchMessagingStatus
    func setReplyHandler(_ handler: (@Sendable (WatchQuickReplyEvent) -> Void)?)
    func sendNotification(
        id: String,
        params: Wings🪽WatchNotifyParams) async throws -> WatchNotificationSendResult
}

extension CameraController: CameraServicing {}
extension ScreenRecordService: ScreenRecordingServicing {}
extension LocationService: LocationServicing {}
