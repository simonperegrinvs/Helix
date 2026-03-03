Feature: Draft external research query
  Scenario: The system prepares a query based on current gaps
    Given a project with unresolved questions
    When the user asks for more research directions
    Then the system creates a reviewable research query draft
    And the draft includes goal, query variants, and filters
