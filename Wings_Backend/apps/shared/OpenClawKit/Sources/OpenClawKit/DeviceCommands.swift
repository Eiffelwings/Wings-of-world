import Foundation

public enum Wings🪽DeviceCommand: String, Codable, Sendable {
    case status = "device.status"
    case info = "device.info"
}

public enum Wings🪽BatteryState: String, Codable, Sendable {
    case unknown
    case unplugged
    case charging
    case full
}

public enum Wings🪽ThermalState: String, Codable, Sendable {
    case nominal
    case fair
    case serious
    case critical
}

public enum Wings🪽NetworkPathStatus: String, Codable, Sendable {
    case satisfied
    case unsatisfied
    case requiresConnection
}

public enum Wings🪽NetworkInterfaceType: String, Codable, Sendable {
    case wifi
    case cellular
    case wired
    case other
}

public struct Wings🪽BatteryStatusPayload: Codable, Sendable, Equatable {
    public var level: Double?
    public var state: Wings🪽BatteryState
    public var lowPowerModeEnabled: Bool

    public init(level: Double?, state: Wings🪽BatteryState, lowPowerModeEnabled: Bool) {
        self.level = level
        self.state = state
        self.lowPowerModeEnabled = lowPowerModeEnabled
    }
}

public struct Wings🪽ThermalStatusPayload: Codable, Sendable, Equatable {
    public var state: Wings🪽ThermalState

    public init(state: Wings🪽ThermalState) {
        self.state = state
    }
}

public struct Wings🪽StorageStatusPayload: Codable, Sendable, Equatable {
    public var totalBytes: Int64
    public var freeBytes: Int64
    public var usedBytes: Int64

    public init(totalBytes: Int64, freeBytes: Int64, usedBytes: Int64) {
        self.totalBytes = totalBytes
        self.freeBytes = freeBytes
        self.usedBytes = usedBytes
    }
}

public struct Wings🪽NetworkStatusPayload: Codable, Sendable, Equatable {
    public var status: Wings🪽NetworkPathStatus
    public var isExpensive: Bool
    public var isConstrained: Bool
    public var interfaces: [Wings🪽NetworkInterfaceType]

    public init(
        status: Wings🪽NetworkPathStatus,
        isExpensive: Bool,
        isConstrained: Bool,
        interfaces: [Wings🪽NetworkInterfaceType])
    {
        self.status = status
        self.isExpensive = isExpensive
        self.isConstrained = isConstrained
        self.interfaces = interfaces
    }
}

public struct Wings🪽DeviceStatusPayload: Codable, Sendable, Equatable {
    public var battery: Wings🪽BatteryStatusPayload
    public var thermal: Wings🪽ThermalStatusPayload
    public var storage: Wings🪽StorageStatusPayload
    public var network: Wings🪽NetworkStatusPayload
    public var uptimeSeconds: Double

    public init(
        battery: Wings🪽BatteryStatusPayload,
        thermal: Wings🪽ThermalStatusPayload,
        storage: Wings🪽StorageStatusPayload,
        network: Wings🪽NetworkStatusPayload,
        uptimeSeconds: Double)
    {
        self.battery = battery
        self.thermal = thermal
        self.storage = storage
        self.network = network
        self.uptimeSeconds = uptimeSeconds
    }
}

public struct Wings🪽DeviceInfoPayload: Codable, Sendable, Equatable {
    public var deviceName: String
    public var modelIdentifier: String
    public var systemName: String
    public var systemVersion: String
    public var appVersion: String
    public var appBuild: String
    public var locale: String

    public init(
        deviceName: String,
        modelIdentifier: String,
        systemName: String,
        systemVersion: String,
        appVersion: String,
        appBuild: String,
        locale: String)
    {
        self.deviceName = deviceName
        self.modelIdentifier = modelIdentifier
        self.systemName = systemName
        self.systemVersion = systemVersion
        self.appVersion = appVersion
        self.appBuild = appBuild
        self.locale = locale
    }
}
