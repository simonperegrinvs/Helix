Feature: Import external report
  Scenario: A user imports a Deep Research report into a project
    Given a research project attached to an Obsidian folder
    When the user imports an external report
    Then the report is stored under the project folder
    And the report is retrievable in project chat
    And the import is recorded in the audit trail
