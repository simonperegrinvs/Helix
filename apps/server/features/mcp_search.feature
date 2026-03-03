Feature: MCP search
  Scenario: An agent retrieves project evidence through MCP
    Given a research project attached to an Obsidian folder
    When an MCP client calls project.search with a question
    Then the result includes ranked evidence with citations
    And the call is recorded in the audit trail
