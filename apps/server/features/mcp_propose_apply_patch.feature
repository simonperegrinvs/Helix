Feature: MCP propose and apply patch
  Scenario: An agent proposes a synthesis update and the user approves it
    Given a project with an existing synthesis note
    When an MCP client calls knowledge.propose_patch for the synthesis note
    Then the system returns a patch without applying it
    When the MCP client calls knowledge.apply_patch with an approval token
    Then the synthesis note is updated in the vault
    And the update is recorded in the audit trail
