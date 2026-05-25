import Testing
@testable import Wings🪽

@Suite(.serialized)
@MainActor
struct OnboardingCoverageTests {
    @Test func `exercise onboarding pages`() {
        OnboardingView.exerciseForTesting()
    }
}
