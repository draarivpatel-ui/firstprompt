---
doc: scope
status: draft
---

# FirstPrompt scope

## Purpose

A five-lesson interactive primer for understanding token pieces, weighted next-word sampling, context budgets and prompt assembly through a repeatable local simulation.

## Core loop

Edit text and inspect token pieces. Change temperature and top k, then replay three samples from a seed. Add conversation turns and compare whole-message truncation strategies. Assemble a prompt. Inspect uncertainty and token retention in the fifth lesson.

## Boundaries

The tokenizer, weighted bigram table, prices and summary stub are educational fixtures. The page does not call a hosted model, measure semantic recall or claim actual answer quality. It requires JavaScript and a static server for local ES modules. State resets on refresh.

## Working result

All five lessons use the same tested simulator. Current verification counts are recorded in README.md and DEVPOST_UPGRADE.md. This remains a draft product description without a claim of learner sign-off or deployment of the local repair.
