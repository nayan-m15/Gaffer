# Task: Audit, Refactor and Fix the Stats Page Report System

## Role

Act as a **Senior React/TypeScript Engineer, UI/UX Engineer and Frontend Software Architect** working on the Gaffer football coaching platform.

Your task is to thoroughly audit, diagnose, plan, refactor and fix the existing reporting functionality on the Stats page.

The reporting system includes:

- Report preview
- Report export/download
- Report printing
- Report sharing
- Report rendering and cleanup
- Light and dark mode compatibility
- Responsive behaviour

**You must inspect the existing implementation, identify the root causes of the problems, create a detailed implementation plan, and then implement the changes directly in the codebase.**

Do not stop after producing the audit or plan.

---

## 1. Current Problem

The Stats page currently has a report preview component that remains permanently visible on the page.

This is incorrect.

The preview should only be displayed when it is required for a reporting operation.

### Required behaviour

**Normal Stats page:**
- Display the usual statistics, graphs, filters and other existing content.
- Do not display the report preview.
- Do not reserve blank space for the preview.
- Do not allow report preview markup to interfere with the normal page layout.
- Keep the existing export, print and share controls accessible.

**When printing a report:**
1. The user initiates printing.
2. The required report preview is displayed in an appropriate temporary interface.
3. The preview shows the report with the correct statistics, tables and charts.
4. The user can proceed with printing or cancel.
5. Only the report content should be printed.
6. When printing finishes or is cancelled, the preview closes and the temporary resources are cleaned up.
7. The user returns to the normal Stats page.

**When sharing a report:**
1. The user initiates sharing.
2. Display the report preview when required by the existing share workflow.
3. Allow the user to review the content and proceed with sharing.
4. Preserve the existing sharing methods and functionality.
5. When sharing completes or is cancelled, dismiss the preview and clean up temporary resources.
6. Return to the original Stats page.

**When exporting a report:**
1. The user initiates the existing export workflow.
2. Generate the report in the requested supported format.
3. Preserve the existing report layout and all expected data.
4. Use temporary report rendering only when necessary for export generation.
5. Remove any temporary report elements after export completes or fails.
6. Do not permanently display the report preview.

An export should not introduce an unnecessary preview confirmation if the existing workflow downloads directly.

---

## 2. Phase One: Complete Codebase Audit

Before modifying anything, inspect the entire Stats page reporting implementation.

Identify:

- The Stats page component and its child components.
- Components responsible for displaying report previews.
- Components responsible for exporting reports.
- Components responsible for printing reports.
- Components responsible for sharing reports.
- Related hooks, services and utilities.
- Existing state management.
- Report generation and formatting functions.
- Print-specific CSS and media queries.
- Any dynamically created DOM elements.
- Any temporary containers, iframes, portals or hidden report elements.
- Any existing modal or dialog components.

Trace how the report preview is rendered and how each action interacts with it.

### Investigate these possible root causes

1. The preview is rendered unconditionally.
2. The preview has incorrect conditional-rendering logic.
3. State controlling preview visibility is incorrectly initialized or updated.
4. Visibility state is never reset after reporting operations.
5. A shared preview component is rendered as part of the normal page layout.
6. Print CSS or hidden DOM containers cause the report to appear when they should not.
7. Export or share functions depend on a permanently mounted visible preview.
8. Event listeners, subscriptions or temporary DOM elements are not properly cleaned up.
9. The report preview is coupled too tightly to the Stats page layout.
10. An earlier implementation change introduced a regression.

Do not assume any specific cause without inspecting the source code.

### Audit each reporting feature

For every feature, establish:

- How it is activated.
- Which components and functions it uses.
- How its data is generated.
- How report rendering works.
- How temporary resources are managed.
- What happens after success.
- What happens after cancellation.
- What happens after an error.
- Whether the user interface returns to its original state.

Produce an audit identifying the responsible files, root causes and recommended fixes.

---

## 3. Phase Two: Create an Implementation Plan

After auditing the existing implementation, create a detailed plan that addresses the problems discovered.

The plan must identify:

1. Existing components that should be reused.
2. Components requiring modifications.
3. Whether any component should be extracted or refactored.
4. Required state-management changes.
5. Report preview visibility rules.
6. Print lifecycle handling.
7. Export lifecycle handling.
8. Share lifecycle handling.
9. Required CSS changes.
10. Cleanup mechanisms.
11. Accessibility requirements.
12. Tests and validation.

Explain the proposed architecture before implementing it.

Prefer a simple, maintainable solution that follows the project's existing patterns.

Do not introduce unnecessary libraries or rewrite working functionality.

**Once the plan is complete, proceed immediately with implementation. Do not stop and wait for approval.**

---

## 4. Phase Three: Implement Temporary Report Preview

Refactor report preview rendering so that it does not form part of the permanently visible Stats page layout.

### Preview behaviour

- The preview must be hidden by default.
- Render it only when needed, or maintain an appropriately isolated non-visible rendering target where required by an existing export implementation.
- Prefer an existing accessible Dialog/Modal component if the project already uses one.
- The preview must be dismissible.
- Provide an obvious close or cancel control.
- Make sure the preview never interferes with the main Stats page.
- Do not allow hidden preview content to create layout shifts, horizontal overflow or unwanted whitespace.
- Support light and dark mode.
- Ensure the preview remains responsive on desktop, tablet and mobile.
- Preserve the professional visual design of the existing report.

### State management

Inspect the current state-management approach and improve it where necessary.

A possible reporting state model is:

- `idle`
- `preview`
- `generating`
- `printing`
- `sharing`
- `exporting`
- `error`

This is a suggested model, not a mandatory implementation.

Use whichever approach fits the existing architecture best.

Important requirements:

- Only one reporting operation should be active at a time.
- Do not allow duplicate action execution.
- Reset temporary state correctly.
- Handle component unmounting safely.
- Avoid stale state and race conditions.
- Do not leave orphaned DOM elements after operations.

---

## 5. Phase Four: Fix the Print Workflow

Audit and repair the complete printing process.

### Requirements

1. Clicking the Print action should initiate the appropriate report preview workflow.
2. The preview must contain all data that belongs in the report.
3. The user must be able to print or cancel.
4. Printing should target the report only, not the entire Stats page.
5. Navigation, sidebars, page actions and unrelated content must not appear in the printed document.
6. All report charts, graphs, tables and statistics must appear correctly.
7. Ensure chart rendering is finished before printing starts.
8. Apply professional print formatting, including page sizing, spacing and sensible page breaks.
9. Prevent charts and tables from being unnecessarily clipped.
10. Preserve the existing report branding.
11. Close the temporary preview when the print interaction completes or is cancelled, where supported by browser lifecycle events.

### Important technical considerations

Investigate the existing implementation before selecting the approach.

Consider:

- `window.print()`
- `beforeprint` and `afterprint`
- `matchMedia('print')`
- Print-specific CSS
- Temporary print containers
- Iframe-based printing, if already used
- Chart rendering readiness
- Browser differences

Do not prematurely close or unmount the print target before the browser has captured the report.

Do not rely on arbitrary timeouts as the primary lifecycle mechanism.

If a browser cannot reliably indicate whether printing was completed or cancelled, ensure the UI remains recoverable without leaving the preview permanently visible.

Clean up event listeners and temporary print resources.

---

## 6. Phase Five: Fix the Share Workflow

Audit and improve the existing sharing implementation.

### Requirements

- Preserve all currently supported sharing methods.
- Display the report preview when needed for the workflow.
- Ensure the shared content corresponds to the user's selected report.
- Preserve selected filters, competition, season and other relevant report settings.
- Handle successful sharing.
- Handle user cancellation.
- Handle failed sharing.
- Prevent duplicate share operations.
- Remove temporary report rendering resources when finished.
- Restore the normal Stats page state.

If the implementation uses the Web Share API, handle its asynchronous lifecycle correctly, including cancellation errors.

If it uses copied links, downloadable files or other mechanisms, retain their existing behaviour.

Do not assume that generating a shareable file is the same as successfully sharing it.

Do not introduce new backend sharing endpoints unless the audit proves they are necessary for the required fix.

---

## 7. Phase Six: Fix the Export Workflow

Audit all report export functionality.

### Requirements

- Preserve the currently supported export formats.
- Verify that report files contain the correct statistics.
- Ensure any report charts or visualizations are included when expected.
- Preserve report formatting, branding and readability.
- Correctly handle export generation success and failure.
- Remove temporary rendering containers and generated object URLs when they are no longer needed.
- Prevent resource leaks.
- Prevent duplicate exports.
- Preserve the existing file naming conventions unless they are demonstrably broken.

If the export library requires mounted HTML, inspect whether an isolated, off-screen rendering target can replace the permanently visible preview.

Do not hide content using techniques that prevent the export engine from capturing it.

Do not modify unrelated export functionality.

---

## 8. Phase Seven: UI/UX Improvements

The reporting system should feel like a polished, production-quality application.

### Preview interface

Where a preview dialog is appropriate, ensure it has:

- A clear report title.
- Readable report content.
- An obvious close/cancel action.
- Appropriate print or share actions for the active workflow.
- Clear loading indicators when generating reports.
- Appropriate error messages.
- Keyboard accessibility.
- Correct focus handling.
- Responsive sizing.
- Proper scrolling for lengthy reports.

Follow Gaffer's existing design system.

The project uses React, TypeScript, Tailwind CSS and shadcn/ui.

Reuse existing components wherever possible.

### Styling rules

- Preserve existing Gaffer branding.
- Maintain light and dark mode compatibility.
- Follow current typography and spacing conventions.
- Use solid colours consistent with the application.
- Avoid unnecessary design changes.
- Do not redesign the Stats page itself.
- Do not introduce a new design system.

The goal is to improve reporting behaviour, not change the overall Stats page.

---

## 9. Phase Eight: Verification and Regression Testing

After implementation, verify the complete reporting workflow.

### Test scenarios

| Scenario | Expected result |
|---|---|
| Open Stats page | No report preview visible |
| Refresh Stats page | No report preview visible |
| Change Stats filters | Report preview stays hidden |
| Click Print | Appropriate temporary preview opens |
| Cancel preview | Preview closes |
| Start printing | Only report content is printed |
| Complete printing | Preview and temporary resources are cleaned up |
| Cancel browser print dialog | UI returns to a usable state |
| Click Share | Existing share workflow operates correctly |
| Complete Share | Preview closes |
| Cancel Share | Preview closes |
| Share fails | Error handled and UI remains usable |
| Export report | File generates correctly |
| Export completes | No preview or temporary container remains visible |
| Export fails | Error is handled and temporary resources are cleaned up |
| Print charts | Charts appear correctly in the document |
| Light mode | Preview and report remain readable |
| Dark mode | Preview and report remain readable |
| Mobile viewport | No overflow or broken layout |
| Repeated report actions | No duplicate processing or stale state |

### Automated verification

Where the existing project supports it:

1. Add or update tests for conditional preview rendering.
2. Test report action lifecycle transitions.
3. Test success, failure and cancellation cleanup.
4. Test repeated reporting operations.
5. Verify that listeners and temporary resources are removed.
6. Run TypeScript checks.
7. Run lint checks.
8. Run relevant unit and integration tests.
9. Run the frontend build.
10. Perform browser verification of print, share and export where available.

Use mocks where browser APIs cannot be exercised automatically.

Do not claim that browser printing or native sharing was verified if it was only mocked.

---

## 10. Implementation Constraints

Follow these rules throughout the task.

1. Inspect before editing.
2. Identify the actual root causes rather than applying superficial CSS fixes.
3. Reuse existing report components and report-generation logic wherever possible.
4. Preserve existing report data, calculations and filters.
5. Do not change the backend unless absolutely necessary.
6. Do not modify unrelated application pages.
7. Do not remove existing reporting functionality.
8. Do not introduce unnecessary dependencies.
9. Follow existing code conventions.
10. Keep all TypeScript types correct.
11. Ensure appropriate cleanup for every operation.
12. Make changes directly in the repository files.
13. Do not stop after producing suggestions or an implementation plan.
14. Verify saved changes and run available checks.
15. Do not commit changes unless explicitly instructed.

---

## 11. Required Final Response

After implementation, provide a structured technical report containing:

### A. Audit findings

For each issue discovered:

- Description
- Root cause
- Affected file and component
- Impact
- Resolution

### B. Implementation plan

Summarize the implementation plan and any architectural decisions made.

### C. Files changed

List every file created or modified, its path and why it was changed.

### D. Implementation summary

Explain exactly how you modified:

- Report preview
- Export
- Print
- Share
- Lifecycle management
- Cleanup mechanisms
- UI/UX

### E. Verification results

Show:

- TypeScript results
- Lint results
- Build results
- Automated test results
- Any manual browser tests performed
- Any remaining limitations

Clearly distinguish passing checks from checks that could not be executed.

### F. Final checklist

Confirm that:

- [ ] Preview is no longer permanently visible.
- [ ] Normal Stats page layout is unaffected.
- [ ] Print opens the correct temporary preview.
- [ ] Print output contains the expected data and charts.
- [ ] Share workflow works correctly.
- [ ] Export workflow works correctly.
- [ ] Temporary previews close appropriately.
- [ ] No stale listeners or temporary DOM resources remain.
- [ ] Light and dark mode work correctly.
- [ ] Mobile responsiveness is preserved.
- [ ] No existing Stats page features were broken.

## Final instruction

**Start by auditing the actual codebase. Determine why the report preview is permanently visible, develop a proper solution, and implement it directly.**

The final result must be a clean Stats page with a reliable, temporary report preview and fully functioning print, export and share operations.

Do not simply hide the preview with CSS while leaving a broken lifecycle behind. Fix the underlying implementation.