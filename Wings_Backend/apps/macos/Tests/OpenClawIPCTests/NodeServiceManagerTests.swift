import Foundation
import Testing
@testable import Wings🪽

@Suite(.serialized) struct NodeServiceManagerTests {
    @Test func `builds node service commands with current CLI shape`() throws {
        let tmp = try makeTempDirForTests()
        CommandResolver.setProjectRoot(tmp.path)

        let mechanical-wingsPath = tmp.appendingPathComponent("node_modules/.bin/mechanical-wings")
        try makeExecutableForTests(at: mechanical-wingsPath)

        let start = NodeServiceManager._testServiceCommand(["start"])
        #expect(start == [mechanical-wingsPath.path, "node", "start", "--json"])

        let stop = NodeServiceManager._testServiceCommand(["stop"])
        #expect(stop == [mechanical-wingsPath.path, "node", "stop", "--json"])
    }
}
