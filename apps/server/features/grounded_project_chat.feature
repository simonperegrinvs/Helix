Feature: Grounded project chat
  Scenario: AI answers with project references
    Given a project with findings and imported reports
    When the user asks a research question
    Then the answer contains citations to project evidence
    And the conversation summary is persisted
