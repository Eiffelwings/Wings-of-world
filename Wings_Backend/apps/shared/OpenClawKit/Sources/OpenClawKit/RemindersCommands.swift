import Foundation

public enum Wings🪽RemindersCommand: String, Codable, Sendable {
    case list = "reminders.list"
    case add = "reminders.add"
}

public enum Wings🪽ReminderStatusFilter: String, Codable, Sendable {
    case incomplete
    case completed
    case all
}

public struct Wings🪽RemindersListParams: Codable, Sendable, Equatable {
    public var status: Wings🪽ReminderStatusFilter?
    public var limit: Int?

    public init(status: Wings🪽ReminderStatusFilter? = nil, limit: Int? = nil) {
        self.status = status
        self.limit = limit
    }
}

public struct Wings🪽RemindersAddParams: Codable, Sendable, Equatable {
    public var title: String
    public var dueISO: String?
    public var notes: String?
    public var listId: String?
    public var listName: String?

    public init(
        title: String,
        dueISO: String? = nil,
        notes: String? = nil,
        listId: String? = nil,
        listName: String? = nil)
    {
        self.title = title
        self.dueISO = dueISO
        self.notes = notes
        self.listId = listId
        self.listName = listName
    }
}

public struct Wings🪽ReminderPayload: Codable, Sendable, Equatable {
    public var identifier: String
    public var title: String
    public var dueISO: String?
    public var completed: Bool
    public var listName: String?

    public init(
        identifier: String,
        title: String,
        dueISO: String? = nil,
        completed: Bool,
        listName: String? = nil)
    {
        self.identifier = identifier
        self.title = title
        self.dueISO = dueISO
        self.completed = completed
        self.listName = listName
    }
}

public struct Wings🪽RemindersListPayload: Codable, Sendable, Equatable {
    public var reminders: [Wings🪽ReminderPayload]

    public init(reminders: [Wings🪽ReminderPayload]) {
        self.reminders = reminders
    }
}

public struct Wings🪽RemindersAddPayload: Codable, Sendable, Equatable {
    public var reminder: Wings🪽ReminderPayload

    public init(reminder: Wings🪽ReminderPayload) {
        self.reminder = reminder
    }
}
