/* TradeX — legal pages and operator details.
   COMPANY: fill in real details before public launch. Empty fields are shown as "not provided". */
(function () {
  'use strict';
  const COMPANY = {
    product: 'TradeX',
    operator: '',          // legal name of the organization or responsible person
    form: '',              // LLC, nonprofit, sole proprietor, student project, etc.
    regNo: '',             // company registration number
    address: '',           // registered address
    email: '',             // contact for data requests and support
    dpo: '',               // person responsible for data protection
    updated: '2026-11-13'
  };
  const v = x => x ? escapeHtml(x) : '<span class="warn-text">not provided</span>';
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const contact = () => COMPANY.email ? '<a href="mailto:' + escapeHtml(COMPANY.email) + '">' + escapeHtml(COMPANY.email) + '</a>' : 'contact not provided';

  const PAGES = {
    privacy: {
      title: 'Privacy Policy',
      html: () => `
<p>Last updated ${COMPANY.updated}. Operator: ${v(COMPANY.operator)}. Data requests: ${contact()}, or use the My data page, where you can download and delete your data yourself.</p>
<h3>What data we process</h3>
<ul>
<li><b>Profile</b>: a nickname you make up and an avatar chosen from a set of ready-made icons. Optionally, what you'd like to be called (you can leave it empty) and a learning goal. No photo uploads. We do not ask for your phone number, email, password, address, school or date of birth.</li>
<li><b>Age group</b>: only "16 or older" or "under 16", and whether a parent confirmed. We do not store your age or date of birth.</li>
<li><b>Learning progress</b>: simulated portfolios, theses, defense answers, lesson results, XP and rating.</li>
<li><b>A technical account ID</b> from the platform the app runs on, so your data stays separate from other people's. Sign-in happens through that platform; this version of TradeX has no separate login or password.</li>
<li><b>Theme setting</b> (light or dark), stored only in this browser.</li>
</ul>
<h3>Where data is stored</h3>
<ul>
<li><b>On your device</b> (localStorage), only if you turned on "Save progress".</li>
<li><b>In the platform's cloud storage</b>, only if "Cloud and league" is on. Your personal progress is visible only to you. The shared league table shows your nickname, avatar number, rating, XP, number of defenses and lessons, best score, tournament results, codes of the classes you joined, your before and after check scores (out of 8) and your usefulness ratings of cases. A teacher who created a class sees only averages and a table by nickname for that class, with no names or contact details. This lets a school judge whether a pilot helped.</li>
</ul>
<h3>AI features</h3>
<p>If "AI features" is on, your thesis, defense answers and questions to the client are sent to the Claude language model through the platform the app runs on, under your account on that platform. Do not include personal data in your answers. Without AI consent the app works offline and your texts are not sent anywhere.</p>
<h3>What we don't do</h3>
<ul>
<li>No analytics, ad trackers, pixels or third-party SDKs. The app loads no external scripts or fonts.</li>
<li>We do not sell your data or share it with third parties for marketing.</li>
<li>No email newsletters. If we ever add them, they will require separate consent and every email will include an unsubscribe link.</li>
<li>No automated decisions with legal effects: board scores are for learning, and a teacher or tournament organizer can review them.</li>
</ul>
<h3>How long we keep data</h3>
<p>Data is kept while you use the app, or until you delete it on the My data page. Deletion takes effect immediately.</p>
<h3>Children</h3>
<p>For users under 16, cloud storage, the shared league and AI features turn on only after a parent or legal guardian confirms. We use 16 because it is the strictest common threshold (the GDPR default for children's consent); the age that applies to you depends on your country. In the United States, COPPA requires verifiable parental consent before collecting personal information from children under 13. This version does not collect contact details from anyone.</p>
<h3>Your rights</h3>
<p>You can get a copy of your data, correct your nickname and profile, withdraw consent and delete your data, all on the My data page without contacting us. Residents of the EU, the UK and some U.S. states (such as California) have these rights by law; we give them to everyone. Need help? ${contact()}.</p>
<h3>Future sign-in with email, Google, Apple ID or phone</h3>
<p>The screens for these sign-in methods are previews and collect nothing. If a server version turns them on, this policy and the consents will be updated before any data is collected: what data (email, phone number, Google or Apple ID), why, how long it is kept, and who processes SMS and sign-in.</p>
<h3>International transfers</h3>
<p>The current version is a learning prototype that uses the cloud storage of the platform it runs on. Before a public launch, the operator must state where data is hosted and which safeguards apply to transfers outside the EU or the UK.</p>`
    },
    terms: {
      title: 'Terms of Use',
      html: () => `
<p>Last updated ${COMPANY.updated}. The service is provided by ${v(COMPANY.operator)}.</p>
<h3>1. What this service is</h3>
<p>${escapeHtml(COMPANY.product)} is an educational investing simulation. It uses the names and tickers of real companies and funds (Nasdaq, NYSE, Euronext, Xetra, BME), but prices, valuation multiples, ESG scores, dividends and news are scenario values generated by software. They are not real quotes or facts about these companies. The scenario calendar is fictional. Clients are fictional. Names and trademarks belong to their owners; TradeX is not affiliated with these companies or exchanges. Money in the simulation is virtual: it cannot be bought, withdrawn or exchanged.</p>
<h3>2. Not investment advice</h3>
<p>Nothing in the app, including AI character answers, scores and lessons, is investment, financial, legal or tax advice. Results in the simulation do not predict results in real markets.</p>
<h3>3. Age</h3>
<p>Users under 16 can use cloud features, the league and AI only with consent from a parent or legal guardian.</p>
<h3>4. Rules</h3>
<ul><li>Do not put personal data, yours or anyone else's, in your nickname or answers.</li><li>No offensive nicknames.</li><li>Do not try to game the scoring (prompting the model inside your answers, multiple accounts in a tournament).</li></ul>
<h3>5. Tournaments and classes</h3>
<p>Tournaments are free for participants. The scoring formula is shown when a tournament is created. The organizer may review an AI score.</p>
<h3>6. Liability</h3>
<p>The service is provided "as is" for learning. We work to keep metric calculations correct but cannot guarantee they are error-free.</p>
<h3>7. Changes</h3>
<p>If these terms change in a material way, we will show a notice in the app.</p>
<h3>8. Contact</h3>
<p>${contact()}</p>`
    },
    refunds: {
      title: 'Refund Policy',
      html: () => `
<p>Last updated ${COMPANY.updated}.</p>
<p>${escapeHtml(COMPANY.product)} is currently completely free: there are no paid features, subscriptions, virtual currency purchases or paid tournament entries. We take no payments, so there is nothing to refund.</p>
<p>If paid features are added, you will see before paying: the full price including all taxes and fees, the subscription term, a one-step way to cancel, and the refund terms. No hidden fees and no automatic renewal without your clear consent.</p>
<p>Virtual money and XP in the simulation have no monetary value and cannot be exchanged or refunded.</p>`
    },
    cookies: {
      title: 'Cookies and Local Storage',
      html: () => `
<p>Last updated ${COMPANY.updated}.</p>
<p>The app sets no cookies and uses no advertising or analytics trackers. It uses your browser's local storage and the platform's cloud storage, and only to the extent you agreed to.</p>
<h3>Categories</h3>
<ul>
<li><b>Strictly necessary</b> (always on): a record of your consent choices (<code>tradex.consent</code>) and your theme (<code>tradex.theme</code>, only if you switched it). Without them the banner and theme would reset every time.</li>
<li><b>Save progress</b> (<code>tradex.v1</code>): profile, portfolios, theses, lessons and chart settings in this browser's localStorage.</li>
<li><b>Cloud and league</b>: sync across devices and the shared league table.</li>
<li><b>AI features</b>: sending your thesis and answers to the language model for live questions and scoring.</li>
</ul>
<p>The platform the app runs on may use its own cookies for sign-in. Those are covered by the platform's policy.</p>
<p>You can change your choices at any time: Consent settings in the page footer or on the My data page.</p>`
    },
    licenses: {
      title: 'Licenses and Sources',
      html: () => `
<p>All app content was created for this project: code, lesson texts, cases and generated scenario prices. There are no images, photos or company logos; charts and avatars are drawn by code. Company names and tickers are used for identification only (nominative use) and belong to their owners.</p>
<ul>
<li><b>Third-party code</b>: none. The chart engine, indicators and drawing tools were written from scratch.</li>
<li><b>Fonts</b>: no web fonts are loaded. The app uses your device's system fonts (for example Inter, Segoe UI or San Francisco if installed).</li>
<li><b>Icons</b>: simple SVG paths drawn in the project code.</li>
<li><b>Design references</b>: layout ideas inspired by public dashboard templates were implemented independently, without copying their code.</li>
<li><b>AI</b>: character answers are generated by Claude (Anthropic) through the platform the app runs on.</li>
</ul>`
    },
    access: {
      title: 'Accessibility',
      html: () => `
<ul>
<li>The whole app works with a keyboard: Tab and Shift+Tab, Enter and Space; Esc closes dialogs.</li>
<li><b>Ctrl+K</b> (⌘K) opens the command palette: sections, cases, lessons, chart tools.</li>
<li>Chart: focus the chart, then ← → to scroll, + − to zoom, Home/End, Delete removes the selected drawing, Esc cancels the tool.</li>
<li>Charts and diagrams have text descriptions for screen readers.</li>
<li>Text contrast meets WCAG 2.1 AA (4.5:1) in both light and dark themes. There is a color-blind candle palette. Switch themes in the top bar or in your profile.</li>
<li>The app respects the system "Reduce motion" setting.</li>
</ul>
<p>Found an accessibility problem? ${contact()}</p>`
    },
    company: {
      title: 'Company Details',
      html: () => `
<table class="tbl"><tr><td class="l">Product</td><td class="l">${escapeHtml(COMPANY.product)}</td></tr>
<tr><td class="l">Operator</td><td class="l">${v(COMPANY.operator)}</td></tr>
<tr><td class="l">Legal form</td><td class="l">${v(COMPANY.form)}</td></tr>
<tr><td class="l">Registration number</td><td class="l">${v(COMPANY.regNo)}</td></tr>
<tr><td class="l">Registered address</td><td class="l">${v(COMPANY.address)}</td></tr>
<tr><td class="l">Contact email</td><td class="l">${v(COMPANY.email)}</td></tr>
<tr><td class="l">Data protection contact</td><td class="l">${v(COMPANY.dpo)}</td></tr></table>
<p class="muted" style="margin-top:10px">Learning prototype. The operator fills in these details before a public launch.</p>`
    }
  };
  window.LEGAL = { COMPANY, PAGES, escapeHtml };
})();
