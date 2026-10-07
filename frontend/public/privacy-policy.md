# Privacy Policy

Effective date: 5 October 2026

> This policy explains how Gaffer handles personal information in its current university-project implementation. Please read the public-dashboard section before adding a player's details.

## 1. Who is responsible

Gaffer is operated as a South African university sport-coaching project. For privacy enquiries, contact the project team at [2801261@students.wits.ac.za](mailto:2801261@students.wits.ac.za). The project team determines how information is used to operate Gaffer; a coach or team also decides what information to enter about its players.

<!-- Project owner: confirm the formal identity and contact details of the POPIA responsible party before wider deployment. -->

## 2. Information we handle

- **Accounts and profiles:** name, email address, verification status, optional phone number, sex, date of birth and profile image reference, and account identifiers. Email and password registration also creates a password credential; Google sign-in may provide basic account details and authentication tokens.
- **Security and invitations:** session and verification records, IP address and browser information associated with sessions, invitee email addresses, invitation status and expiry, and one-time invitation token records.
- **Teams and players:** team membership and role; team name and colour; player name, date of birth where entered, position, squad number, availability, archived status and any link between a player record and a claimed account.
- **Coaching activity:** events, venues and coordinates, notes, attendance responses, competitions, seasons, tactics, line-ups, match and opponent details, match events, performance statistics and generated insights.
- **Injuries:** body region, injury type, reported severity, date, context, status, recovery estimates, return dates, descriptions, notes, recorded diagnosis source and injury timeline entries. These may reveal health information.
- **Technical information:** information needed to deliver the application, troubleshoot synchronisation and protect accounts, including session metadata and synchronisation records.

We receive this information from users and coaches, through application activity, from Google if selected for sign-in, and from the technical systems that run Gaffer. Please avoid putting unnecessary sensitive details in free-text fields.

## 3. Why information is used

We use information to create and verify accounts, authenticate users, manage team membership and invitations, provide coaching and player features, record attendance and matches, generate reports and statistics, synchronise offline work, respond to enquiries, secure the application and maintain the project. Email addresses are used for sign-in, verification and relevant invitations. Gaffer does not currently offer password recovery by email.

Under the Protection of Personal Information Act, 2013 (POPIA), processing must have a lawful justification. Depending on the activity, we rely on the need to provide the requested service, a legitimate interest in operating and protecting it, consent where required, or another ground permitted by law. A coach who enters another person's information must have an appropriate basis for doing so. Injury information and children's information need particular care and may require consent from the person concerned or a legally competent person, or another applicable legal authorisation.

## 4. What is public and what is shared within a team

Gaffer has an unauthenticated public dashboard. It can display team, season and competition names; fixture details, venues, opponents and scores; and active players' names, positions, squad numbers and performance statistics. Anyone with access to the dashboard or its public API can view this information. Archived players are omitted from the public player list, but previously disclosed information may remain in copies held by others. Do not add a player unless this level of publication is appropriate and authorised.

Other team records are made available according to account role and team association. Coaches, assistants and linked players may see information relevant to their access. Injury records and attendance notes are not part of the public dashboard. Reports downloaded from Gaffer are stored and shared outside the application at the downloader's discretion.

## 5. AI and external services

Where configured, Gaffer sends prompts to Google's Gemini service to produce match or season insights and to help interpret requests in optional assistants, including injury and roster workflows. Prompts can contain team and player names, match events, statistics or information typed into an assistant. An injury assistant request may contain health-related details. Do not use these features for information you lack authority to share with that provider. Generated responses can be inaccurate and should be checked by a person.

The code also provides for Google sign-in, Brevo transactional email, Vercel frontend hosting, Render backend hosting, a Neon/PostgreSQL database, PowerSync synchronisation, and Open-Meteo and OpenStreetMap Nominatim weather or location lookup services. Which optional services operate depends on deployment configuration and the features used. Relevant information, such as email addresses, synchronised records, prompts or event coordinates, may be sent to the provider needed for that feature. These providers have their own privacy notices. We do not sell personal information.

## 6. Cookies and storage on your device

Gaffer uses authentication cookies to maintain a signed-in session. A remember-me choice affects session persistence. The application also uses browser storage for theme and sidebar preferences, pending invitation or player-claim links, the Google sign-in return path, reminder and synchronisation status, and a cached session when you choose to be remembered. Offline match information and pending changes can be stored in a local PowerSync database on your device and synchronised later.

Clearing browser data may remove unsynchronised changes or require you to sign in again. Protect devices used for sensitive team information. Gaffer does not currently use advertising or analytics tracking in its application code; hosting and service providers may still collect technical logs under their own practices.

## 7. Transfers outside South Africa

External infrastructure, authentication, email, synchronisation and AI services may process information outside South Africa. Processing locations vary with provider configuration, and we do not promise that all information remains in South Africa. Cross-border handling must meet POPIA's applicable requirements, including appropriate protection or another permitted basis for a transfer.

<!-- Project owner: verify provider locations and transfer safeguards for the actual deployment. -->

## 8. Retention and deletion

We keep information while it is needed to provide Gaffer, maintain security, resolve requests or meet legal obligations. We have not set a single retention period for every category of information. Archiving a player hides that player from the active roster and public player list; it does not delete the record. Removing information from the application may not remove previously downloaded reports, public copies, backups or unsynchronised data on a device immediately.

There is no self-service account deletion feature. You may request deletion using the contact below. We will assess what can and must be deleted, what must be retained by law and what may be needed for other team members' records, then explain the outcome.

## 9. Security

Gaffer uses authenticated sessions, email verification, role and team access checks, and hashed one-time invitation tokens. These safeguards reduce risk but cannot guarantee complete security. Please keep credentials, invitation links and devices secure, and contact us if you suspect unauthorised access. We will assess a security compromise and make notifications required by applicable law.

## 10. Your rights

Subject to POPIA and other applicable law, you may ask what personal information we hold about you; request access, correction or deletion where the legal requirements are met; object to certain processing; or withdraw consent where consent is the basis for processing. Withdrawal does not undo processing that was lawful before it. You can edit some profile details within Gaffer. For other requests, email [2801261@students.wits.ac.za](mailto:2801261@students.wits.ac.za). We may verify your identity before responding.

You may raise a complaint with South Africa's [Information Regulator](https://inforegulator.org.za/). Other privacy laws may provide additional rights if they apply to your circumstances.

## 11. Children and external links

Coaches may enter information about young players. Gaffer is not intended for a child to provide information independently without appropriate adult involvement. Anyone entering or inviting a child must ensure the required authority and lawful basis exist, especially for injury information and public player details. Contact us if you believe a child's information was entered improperly.

Links to external sites are provided for convenience. Their operators handle information under their own privacy practices.

## 12. Updates and contact

We may update this policy as Gaffer changes. We will revise the effective date and take reasonable steps to draw material changes to users' attention. For privacy questions, requests or concerns, contact [2801261@students.wits.ac.za](mailto:2801261@students.wits.ac.za).

[Return to Gaffer](/) | [Terms of Service](terms-of-service.md)
