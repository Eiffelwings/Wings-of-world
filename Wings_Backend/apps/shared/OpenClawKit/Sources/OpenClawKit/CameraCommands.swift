import Foundation

public enum Wings🪽CameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
}

public enum Wings🪽CameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum Wings🪽CameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum Wings🪽CameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct Wings🪽CameraSnapParams: Codable, Sendable, Equatable {
    public var facing: Wings🪽CameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: Wings🪽CameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: Wings🪽CameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: Wings🪽CameraImageFormat? = nil,
        deviceId: String? = nil,
        delayMs: Int? = nil)
    {
        self.facing = facing
        self.maxWidth = maxWidth
        self.quality = quality
        self.format = format
        self.deviceId = deviceId
        self.delayMs = delayMs
    }
}

public struct Wings🪽CameraClipParams: Codable, Sendable, Equatable {
    public var facing: Wings🪽CameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: Wings🪽CameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: Wings🪽CameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: Wings🪽CameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}
