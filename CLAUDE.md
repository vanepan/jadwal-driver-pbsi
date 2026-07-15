# ====================================================================================
# SARPRAS INTELLIGENCE
# MASTER CONTEXT
#
# READ THIS DOCUMENT CAREFULLY BEFORE WRITING ANY CODE.
#
# This document is AUTHORITATIVE.
# Every future implementation MUST follow this architecture.
#
# ====================================================================================

# PROJECT OVERVIEW

You are joining an existing enterprise application named Sarpras Operations.

This application is already in production.

DO NOT redesign the application.

DO NOT rewrite the architecture.

DO NOT replace existing modules.

Your responsibility is to extend the system incrementally.

The next major module is called:

Sarpras Intelligence

This module is NOT a chatbot.

This module is NOT a document generator.

This module is an Organizational Learning Platform.

------------------------------------------------------------------------------------

# WHY THIS PROJECT EXISTS

For many years, organizational knowledge only existed inside experienced staff.

When a senior staff member receives a problem,
they DO NOT immediately write a NOR.

Instead they:

Observe

↓

Diagnose

↓

Reason

↓

Make Decision

↓

Communicate

↓

Create Document

The document is only the final output.

The reasoning disappears.

This project exists to preserve organizational reasoning.

NOT merely documents.

------------------------------------------------------------------------------------

# PROJECT GOAL

The primary goal is NOT generating NOR.

The primary goal is preserving organizational knowledge.

Generated NOR is only one possible output.

The long-term mission is:

- preserve institutional memory
- preserve organizational reasoning
- help new employees learn faster
- assist experienced employees
- explain every recommendation
- continuously learn from approved organizational knowledge

------------------------------------------------------------------------------------

# WHAT AI IS

AI is NOT the source of truth.

AI is NOT the owner of organizational knowledge.

AI is NOT the final decision maker.

AI is only:

- analyzer
- assistant
- knowledge extractor
- reasoning assistant

Human always owns the final decision.

------------------------------------------------------------------------------------

# WHAT KNOWLEDGE IS

Knowledge is NOT PDF.

Knowledge is NOT DOCX.

Knowledge is NOT OCR output.

Knowledge is structured organizational understanding.

Every document uploaded into Sarpras Intelligence should eventually become reusable organizational knowledge.

------------------------------------------------------------------------------------

# CORE DESIGN PRINCIPLES

Principle 1

Reasoning is more valuable than documents.

Principle 2

Diagnosis before recommendation.

Principle 3

Decision before documentation.

Principle 4

Evidence before recommendation.

Principle 5

Human owns final authority.

Principle 6

Knowledge must always be explainable.

Principle 7

Never invent business rules.

------------------------------------------------------------------------------------

# THINKING MODEL

Every organizational task follows this lifecycle.

Problem

↓

Observation

↓

Diagnosis

↓

Knowledge Gap Identification

↓

Reasoning

↓

Decision

↓

Governance

↓

Communication

↓

Documentation

↓

Learning

The system must support this thinking process.

Never reverse it.

------------------------------------------------------------------------------------

# EXISTING APPLICATION

The application already contains production modules.

Respect existing architecture.

Respect existing coding style.

Respect existing repository structure.

Respect feature gates.

Respect backward compatibility.

Never introduce breaking changes.

Never replace production logic unless explicitly instructed.

------------------------------------------------------------------------------------

# DEVELOPMENT STRATEGY

Development must always be incremental.

Every sprint must produce:

- small diff
- isolated module
- fully testable
- backward compatible
- feature gated

Never attempt a massive rewrite.

------------------------------------------------------------------------------------

# KNOWLEDGE OWNERSHIP

Knowledge belongs to PBSI.

NOT to AI.

NOT to Claude.

NOT to ChatGPT.

Models may change.

Knowledge must remain.

The repository is the source of truth.

------------------------------------------------------------------------------------

# IMPLEMENTATION PHILOSOPHY

Build infrastructure.

Not intelligence.

The infrastructure should allow organizational intelligence to evolve over time.

AI is replaceable.

Knowledge is permanent.

------------------------------------------------------------------------------------

# EXPLAINABILITY

Every recommendation must be explainable.

Every recommendation should eventually be traceable back to:

- business rule
- reasoning rule
- evidence
- approved organizational knowledge

Never produce opaque recommendations.

------------------------------------------------------------------------------------

# DEVELOPMENT MINDSET

You are NOT implementing AI.

You are implementing the operating system for organizational knowledge.

Everything should be:

- modular
- deterministic where possible
- explainable
- testable
- extensible
- maintainable

------------------------------------------------------------------------------------

# YOUR MISSION

Your mission is NOT to create an AI.

Your mission is to preserve how experienced Sarpras staff think.

If this system can help a new employee reason like an experienced staff member,

the project succeeds.

If this system only generates NOR,

the project fails.

# END OF MASTER CONTEXT
