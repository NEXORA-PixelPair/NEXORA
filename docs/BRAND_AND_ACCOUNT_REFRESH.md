# NEXORA brand and account-state refresh

## Supplied logo assets

- `client/public/brand/nexora-wordmark.png` — supplied full NEXORA wordmark.
- `client/public/brand/nexora-mark.png` — supplied orbital N mark.
- Both assets have their white canvas removed to allow clean display over NEXORA's surfaces.
- The wordmark is used in the sidebar and sign-in card. The orbital N mark appears in the left login feature panel, loading state and favicon.

## Theme and typography

- Dark is the default appearance.
- The profile dropdown at the top-right exposes Dark and Light appearance choices.
- The selected appearance is stored in browser local storage and restored when the app is reopened.
- Inter is used for body/UI text; Poppins is used for bold headings.
- Instructional helper text is styled in italics.

## Account isolation

- Every successful sign-in (email/password or Google) clears prior in-memory account state before loading the new workspace.
- Sign-out clears the active workspace, reports, selected report, repository list/search, GitHub status, knowledge sources, project/source form content and AI conversation.
- AI requests capture the token used to submit the question. A late answer is discarded if the browser has since switched to a different token.
- Workspace, GitHub status and source loading also verify that the session token is still current before applying returned data.
- Server workspace collections continue to be queried by authenticated owner ID (`ownerId`) rather than using a global unscoped query.
