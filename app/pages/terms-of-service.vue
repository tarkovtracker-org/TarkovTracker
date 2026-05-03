<script setup lang="ts">
  const { t } = useI18n({ useScope: 'global' });
  useSeoMeta({
    title: 'Terms of Service',
    description: 'TarkovTracker terms of service and usage guidelines.',
  });
  const lastUpdated = 'March 8, 2026';
  const ACTIVE_SECTION_OFFSET = 160;
  const toc = [
    { id: 'acceptance', title: '1. Acceptance of Terms' },
    { id: 'eligibility', title: '2. Eligibility and Account Requirements' },
    { id: 'service', title: '3. Service Description and Scope' },
    { id: 'non-affiliation', title: '4. Non-Affiliation and Trademark Disclaimer' },
    { id: 'conduct', title: '5. User Conduct and Obligations' },
    { id: 'ip', title: '6. Intellectual Property Rights' },
    { id: 'privacy', title: '7. Privacy and Data Handling' },
    { id: 'third-parties', title: '8. Third-Party Services and Integrations' },
    { id: 'disclaimers', title: '9. Disclaimers and Warranties' },
    { id: 'liability', title: '10. Limitation of Liability' },
    { id: 'indemnification', title: '11. Indemnification' },
    { id: 'modifications', title: '12. Modifications to Service and Terms' },
    { id: 'termination', title: '13. Termination' },
    { id: 'disputes', title: '14. Dispute Resolution and Governing Law' },
    { id: 'misc', title: '15. Miscellaneous Provisions' },
    { id: 'contact', title: '16. Contact Information' },
    { id: 'acknowledgment', title: '17. Acknowledgment' },
  ];
  const activeId = ref(toc[0]?.id || 'acceptance');
  let scrollRoot: HTMLElement | null = null;
  let updateActiveIdFrameId: number | null = null;
  const updateActiveId = () => {
    const currentScrollTop = scrollRoot?.scrollTop ?? window.scrollY;
    const rootTop = scrollRoot?.getBoundingClientRect().top ?? 0;
    activeId.value =
      [...toc].reverse().find((item) => {
        const section = document.getElementById(item.id);
        if (!section) {
          return false;
        }
        const sectionTop = section.getBoundingClientRect().top - rootTop + currentScrollTop;
        return currentScrollTop + ACTIVE_SECTION_OFFSET >= sectionTop;
      })?.id ||
      toc[0]?.id ||
      'acceptance';
  };
  const scheduleUpdateActiveId = () => {
    if (updateActiveIdFrameId !== null) {
      return;
    }
    updateActiveIdFrameId = window.requestAnimationFrame(() => {
      updateActiveIdFrameId = null;
      updateActiveId();
    });
  };
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    activeId.value = id;
  };
  onMounted(() => {
    const rootCandidate = document.getElementById('main-content')?.firstElementChild;
    scrollRoot = rootCandidate instanceof HTMLElement ? rootCandidate : null;
    updateActiveId();
    if (scrollRoot) {
      scrollRoot.addEventListener('scroll', scheduleUpdateActiveId, { passive: true });
    } else {
      window.addEventListener('scroll', scheduleUpdateActiveId, { passive: true });
    }
    window.addEventListener('resize', updateActiveId, { passive: true });
  });
  onBeforeUnmount(() => {
    if (scrollRoot) {
      scrollRoot.removeEventListener('scroll', scheduleUpdateActiveId);
    } else {
      window.removeEventListener('scroll', scheduleUpdateActiveId);
    }
    if (updateActiveIdFrameId !== null) {
      window.cancelAnimationFrame(updateActiveIdFrameId);
    }
    window.removeEventListener('resize', updateActiveId);
  });
</script>
<template>
  <div class="mx-auto max-w-7xl px-4 py-4">
    <div class="flex flex-col items-start xl:flex-row xl:gap-2">
      <!-- Spacer for fixed sidebar -->
      <div class="hidden w-75 shrink-0 xl:block"></div>
      <!-- Fixed sidebar (stays in viewport, accounts for drawer + container) -->
      <aside class="fixed left-[calc(max(15rem,(100vw-100rem)/2+15rem))] hidden w-75 xl:block">
        <UCard class="border-surface-700/50 bg-surface-900/90 border backdrop-blur">
          <nav :aria-label="t('page.terms_of_service.table_of_contents')">
            <ol class="space-y-2 text-sm leading-relaxed">
              <li v-for="item in toc" :key="item.id">
                <button
                  type="button"
                  :aria-current="activeId === item.id ? 'true' : undefined"
                  class="hover:bg-primary-500/10 hover:text-primary-200 flex w-full items-start rounded px-2 py-1 text-left transition"
                  :class="
                    activeId === item.id
                      ? 'bg-primary-500/10 text-primary-200 border-primary-500/20 border'
                      : 'border border-transparent'
                  "
                  @click="scrollTo(item.id)"
                >
                  {{ item.title }}
                </button>
              </li>
            </ol>
          </nav>
        </UCard>
      </aside>
      <section class="w-full min-w-0 xl:flex-1">
        <UCard
          class="prose prose-lg prose-invert prose-headings:text-primary-100 prose-a:text-link prose-strong:text-primary-200 max-w-none"
        >
          <div class="terms-content space-y-12 [&>section]:scroll-mt-28">
            <div
              id="top"
              class="border-surface-700/50 mb-8 flex items-center justify-between border-b pb-4"
            >
              <p class="text-primary-400 mb-0 text-sm tracking-[0.2em] uppercase">Legal Document</p>
              <p class="text-surface-400 mb-0 text-sm">Last Updated: {{ lastUpdated }}</p>
            </div>
            <!-- 1. ACCEPTANCE OF TERMS -->
            <section id="acceptance">
              <h2 class="mb-3 text-2xl font-bold">1. Acceptance of Terms</h2>
              <p class="mb-3 leading-relaxed">
                Welcome to TarkovTracker ("Service", "Application", "Platform", "we", "us", or
                "our"). By accessing, browsing, or using this Service in any manner—whether through
                our website, application programming interfaces (APIs), mobile applications, or any
                other means—you ("User", "you", or "your") acknowledge that you have read,
                understood, and agree to be bound by these Terms of Service ("Terms", "Agreement")
                and all applicable laws and regulations.
              </p>
              <p class="mb-3 leading-relaxed">
                If you do not agree with any provision of these Terms, you must immediately
                discontinue use of the Service and refrain from accessing any part of the Platform.
                Continued use of the Service constitutes acceptance of these Terms as they may be
                amended from time to time.
              </p>
              <p class="leading-relaxed">
                These Terms constitute a legally binding agreement between you and the operators,
                maintainers, contributors, and affiliated parties of TarkovTracker. By using this
                Service, you represent and warrant that you have the legal capacity to enter into
                this Agreement.
              </p>
            </section>
            <!-- 2. ELIGIBILITY -->
            <section id="eligibility">
              <h2 class="mb-3 text-2xl font-bold">2. Eligibility and Account Requirements</h2>
              <h3 class="mb-2 text-xl font-semibold">2.1 Age Requirements</h3>
              <p class="mb-3 leading-relaxed">
                You must be at least 13 years of age (or the minimum legal age in your jurisdiction,
                whichever is greater) to use this Service. If you are under 18 years of age (or the
                age of majority in your jurisdiction), you may only use the Service under the
                supervision of a parent or legal guardian who agrees to be bound by these Terms.
              </p>
              <h3 class="mb-2 text-xl font-semibold">2.2 Account Authentication</h3>
              <p class="mb-3 leading-relaxed">
                Access to certain features of the Service requires authentication through
                third-party OAuth providers (including but not limited to Discord, Google, or other
                supported providers via Supabase authentication). By authenticating through these
                providers, you authorize us to access certain information from your account as
                permitted by the provider and you agree to be bound by the respective provider's
                terms of service.
              </p>
              <h3 class="mb-2 text-xl font-semibold">2.3 Account Security</h3>
              <p class="leading-relaxed">
                You are solely responsible for maintaining the confidentiality and security of your
                account credentials. You agree to immediately notify us of any unauthorized access
                to or use of your account. We are not liable for any loss or damage arising from
                your failure to maintain account security.
              </p>
            </section>
            <!-- 3. SERVICE DESCRIPTION -->
            <section id="service">
              <h2 class="mb-3 text-2xl font-bold">3. Service Description and Scope</h2>
              <h3 class="mb-2 text-xl font-semibold">3.1 Nature of Service</h3>
              <p class="mb-3 leading-relaxed">
                TarkovTracker is a free, open-source, community-driven progress tracking application
                for the video game Escape from Tarkov. "The Service" includes all web applications,
                APIs, mobile applications, subdomains, and related software accessible through
                tarkovtracker.org or any associated domain, including but not limited to the
                Nuxt-based web application, server-side APIs, and data synchronization services. The
                Service provides tools for tracking quests, hideout upgrades, player progression,
                team collaboration, and related game mechanics across multiple game modes (PvP and
                PvE).
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">3.2 Open Source Nature</h3>
              <p class="mb-4 leading-relaxed">
                The source code for TarkovTracker is publicly available and distributed under the
                GNU General Public License v3.0 (GPLv3). The Service is provided by volunteers and
                community contributors without any warranty or guarantee of continued availability,
                functionality, or support.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">3.3 Third-Party Data Sources</h3>
              <p class="leading-relaxed">
                The Service aggregates data from third-party sources including but not limited to
                the Escape from Tarkov Wiki, tarkov.dev API, and community-maintained databases. We
                do not guarantee the accuracy, completeness, or timeliness of this data. Game data,
                quest information, item statistics, and other content may be outdated, incorrect, or
                subject to change without notice.
              </p>
            </section>
            <!-- 4. NON-AFFILIATION DISCLAIMER -->
            <section id="non-affiliation">
              <h2 class="mb-4 text-2xl font-bold">4. Non-Affiliation and Trademark Disclaimer</h2>
              <h3 class="mt-6 mb-3 text-xl font-semibold">4.1 Independent Service</h3>
              <p class="mb-4 leading-relaxed">
                TarkovTracker and its operators, contributors, and maintainers are
                <strong>NOT</strong>
                affiliated with, associated with, authorized by, endorsed by, sponsored by, or in
                any way officially connected with:
              </p>
              <ul class="mb-4 ml-6 list-disc space-y-2">
                <li class="leading-relaxed">
                  Battlestate Games Limited or any of its subsidiaries or affiliates
                </li>
                <li class="leading-relaxed">
                  The developers, publishers, or rights holders of Escape from Tarkov or Escape from
                  Tarkov: Arena
                </li>
                <li class="leading-relaxed">
                  BattlEye Innovations e.K. or any anti-cheat service provider
                </li>
                <li class="leading-relaxed">
                  Discord Inc., Discord Netherlands B.V., or any OAuth authentication provider
                </li>
                <li class="leading-relaxed">
                  Supabase Inc. or Cloudflare, Inc. (service hosting providers)
                </li>
              </ul>
              <h3 class="mt-6 mb-3 text-xl font-semibold">4.2 Trademark Notice</h3>
              <p class="mb-4 leading-relaxed">
                Escape from Tarkov, Escape from Tarkov: Arena, and all associated trademarks,
                service marks, trade names, logos, and intellectual property are the exclusive
                property of Battlestate Games Limited. All other product names, company names,
                trademarks, and service marks mentioned in connection with this Service are the
                property of their respective owners.
              </p>
              <p class="leading-relaxed">
                Use of these trademarks, names, or marks on this Platform does not imply affiliation
                with, endorsement by, or approval of the trademark owners. All references are made
                solely for identification and informational purposes in accordance with fair use
                principles.
              </p>
            </section>
            <!-- 5. USER OBLIGATIONS -->
            <section id="conduct">
              <h2 class="mb-4 text-2xl font-bold">5. User Conduct and Obligations</h2>
              <h3 class="mt-6 mb-3 text-xl font-semibold">5.1 Acceptable Use</h3>
              <p class="mb-4 leading-relaxed">
                You agree to use the Service only for lawful purposes and in accordance with these
                Terms. You agree NOT to:
              </p>
              <ul class="mb-4 ml-6 list-disc space-y-2">
                <li class="leading-relaxed">
                  Violate any applicable local, state, national, or international law or regulation
                </li>
                <li class="leading-relaxed">
                  Transmit any material that is defamatory, obscene, offensive, threatening,
                  harassing, abusive, hateful, or otherwise objectionable
                </li>
                <li class="leading-relaxed">
                  Impersonate or attempt to impersonate any person or entity
                </li>
                <li class="leading-relaxed">
                  Engage in any conduct that restricts or inhibits anyone's use or enjoyment of the
                  Service
                </li>
                <li class="leading-relaxed">
                  Use any robot, spider, scraper, or other automated means to access the Service
                  without our express written permission
                </li>
                <li class="leading-relaxed">
                  Introduce viruses, trojans, worms, logic bombs, or other malicious or
                  technologically harmful material
                </li>
                <li class="leading-relaxed">
                  Attempt to gain unauthorized access to any portion of the Service, other users'
                  accounts, or any systems or networks connected to the Service
                </li>
                <li class="leading-relaxed">
                  Use the Service to violate the Terms of Service of Escape from Tarkov or any
                  third-party service
                </li>
                <li class="leading-relaxed">
                  Reverse engineer, decompile, disassemble, or otherwise attempt to derive source
                  code from the Service (except as expressly permitted by the GPLv3 license for
                  open-source components)
                </li>
                <li class="leading-relaxed">
                  Excessively burden the Service's infrastructure, including but not limited to
                  spamming API requests, "scraping" data at a rate that exceeds reasonable human
                  usage, or bypassing rate limits
                </li>
                <li class="leading-relaxed">
                  Promote, advertise, or facilitate the sale of in-game items for real money (RMT),
                  account boosting services, or third-party cheat software/hacks
                </li>
              </ul>
              <h3 class="mt-6 mb-3 text-xl font-semibold">5.2 Game Terms Compliance</h3>
              <p class="mb-4 leading-relaxed">
                While TarkovTracker is designed as an external progress tracking tool, you
                acknowledge and agree that you remain solely responsible for compliance with all
                terms of service, end-user license agreements, and rules established by Battlestate
                Games Limited for Escape from Tarkov.
              </p>
              <p class="leading-relaxed">
                We make no representation or warranty that use of this Service complies with, or
                will not result in a violation of, the Escape from Tarkov Terms of Service, License
                Agreement, or any anti-cheat policies. You use this Service entirely at your own
                risk with respect to your game account standing.
              </p>
            </section>
            <!-- 6. INTELLECTUAL PROPERTY -->
            <section id="ip">
              <h2 class="mb-4 text-2xl font-bold">6. Intellectual Property Rights</h2>
              <h3 class="mt-6 mb-3 text-xl font-semibold">6.1 Open Source License</h3>
              <p class="mb-4 leading-relaxed">
                The TarkovTracker source code is licensed under the GNU General Public License v3.0
                (GPLv3). You may obtain a copy of the source code, modify it, and redistribute it in
                accordance with the terms of the GPLv3 license. The full license text is available
                in the repository.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">6.2 Third-Party Content</h3>
              <p class="mb-4 leading-relaxed">
                Game data, images, names, descriptions, and other content derived from Escape from
                Tarkov are the property of Battlestate Games Limited. Data obtained from third-party
                sources (such as the Escape from Tarkov Wiki or tarkov.dev) is subject to their
                respective licenses and terms of use.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">6.3 User-Generated Content</h3>
              <p class="leading-relaxed">
                By submitting, posting, or transmitting any content through the Service (including
                but not limited to team names, user profiles, or progress data), you grant us a
                worldwide, non-exclusive, royalty-free, perpetual, irrevocable license to use,
                reproduce, modify, adapt, publish, and display such content in connection with
                operating and improving the Service.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">6.4 Copyright Infringement & DMCA</h3>
              <p class="mb-4 leading-relaxed">
                We respect the intellectual property rights of others and expect users to do the
                same. If you believe that content available through the Service infringes your
                copyright, you may submit a notice of alleged infringement in accordance with the
                Digital Millennium Copyright Act (DMCA).
              </p>
              <p class="mb-4 leading-relaxed">DMCA notices should include:</p>
              <ul class="mb-4 ml-6 list-disc space-y-2">
                <li class="leading-relaxed">
                  Identification of the copyrighted work claimed to have been infringed
                </li>
                <li class="leading-relaxed">
                  Identification of the material claimed to be infringing and its location on the
                  Service
                </li>
                <li class="leading-relaxed">
                  Your contact information (address, telephone number, email)
                </li>
                <li class="leading-relaxed">
                  A statement that you have a good faith belief that use of the material is not
                  authorized
                </li>
                <li class="leading-relaxed">
                  A statement under penalty of perjury that the information is accurate and you are
                  authorized to act
                </li>
                <li class="leading-relaxed">Your physical or electronic signature</li>
              </ul>
              <p class="leading-relaxed">
                We reserve the right to remove content alleged to be infringing and may terminate
                accounts of repeat infringers. We are not liable for any claims arising from
                user-uploaded content and enjoy safe harbor protections under applicable copyright
                laws.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">6.5 Feedback and Suggestions</h3>
              <p class="leading-relaxed">
                If you provide us with any feedback, suggestions, bug reports, or feature requests
                ("Feedback"), you agree that we may use such Feedback for any purpose without
                obligation or compensation to you. You hereby grant us a perpetual, irrevocable,
                non-exclusive, royalty-free, worldwide license to use, display, reproduce, perform,
                distribute, and modify such Feedback.
              </p>
            </section>
            <!-- 7. PRIVACY AND DATA -->
            <section id="privacy">
              <h2 class="mb-4 text-2xl font-bold">7. Privacy and Data Handling</h2>
              <h3 class="mt-6 mb-3 text-xl font-semibold">7.1 Data Collection</h3>
              <p class="mb-4 leading-relaxed">
                The Service collects and processes certain information as necessary to provide
                functionality, including:
              </p>
              <ul class="mb-4 ml-6 list-disc space-y-2">
                <li class="leading-relaxed">
                  Authentication data provided by third-party OAuth providers (email, username,
                  profile information)
                </li>
                <li class="leading-relaxed">
                  User progress data (quest completions, hideout progress, level tracking)
                </li>
                <li class="leading-relaxed">
                  Team collaboration data (team memberships, shared progress)
                </li>
                <li class="leading-relaxed">API tokens and access credentials for team features</li>
                <li class="leading-relaxed">
                  Usage analytics and diagnostic information, including Google Analytics and
                  Microsoft Clarity data if you opt in to optional analytics
                </li>
              </ul>
              <h3 class="mt-6 mb-3 text-xl font-semibold">7.2 Data Storage and Security</h3>
              <p class="mb-4 leading-relaxed">
                User data is stored using Supabase (a third-party database and authentication
                provider) and the Service is hosted on Cloudflare Pages infrastructure. While we
                implement reasonable security measures to protect your data, we cannot guarantee
                absolute security.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">7.3 Data Retention and Deletion</h3>
              <p class="mb-4 leading-relaxed">
                You may request deletion of your account and associated data at any time through the
                Service settings or by contacting us. Upon deletion, your personal information and
                progress data will be removed from active systems, though some data may be retained
                in backups for a limited period.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">7.4 Third-Party Data Sharing</h3>
              <p class="leading-relaxed">
                We do not sell, rent, or trade your personal information to third parties for
                marketing purposes. Data may be shared with service providers (Supabase, Cloudflare,
                Google Analytics, Microsoft Clarity, OAuth providers) as necessary to operate the
                Service and, where applicable, only after your consent to optional analytics. Data
                may also be disclosed if required by law or to protect our rights.
              </p>
            </section>
            <!-- 8. THIRD-PARTY SERVICES -->
            <section id="third-parties">
              <h2 class="mb-4 text-2xl font-bold">8. Third-Party Services and Integrations</h2>
              <h3 class="mt-6 mb-3 text-xl font-semibold">8.1 Service Dependencies</h3>
              <p class="mb-4 leading-relaxed">
                The Service relies on multiple third-party providers and services, including but not
                limited to:
              </p>
              <ul class="mb-4 ml-6 list-disc space-y-2">
                <li class="leading-relaxed">
                  <strong>Supabase:</strong>
                  Database, authentication, and real-time synchronization
                </li>
                <li class="leading-relaxed">
                  <strong>Cloudflare Pages:</strong>
                  Web hosting and content delivery
                </li>
                <li class="leading-relaxed">
                  <strong>OAuth Providers:</strong>
                  Discord, Google, and other third-party authentication services
                </li>
                <li class="leading-relaxed">
                  <strong>Google Analytics:</strong>
                  Optional website analytics and product improvement measurement
                </li>
                <li class="leading-relaxed">
                  <strong>Microsoft Clarity:</strong>
                  Optional website analytics, session replay, and product improvement measurement
                </li>
                <li class="leading-relaxed">
                  <strong>tarkov.dev API:</strong>
                  Game data and content aggregation
                </li>
                <li class="leading-relaxed">
                  <strong>Escape from Tarkov Wiki:</strong>
                  Community-maintained game information
                </li>
              </ul>
              <h3 class="mt-6 mb-3 text-xl font-semibold">8.2 Third-Party Terms</h3>
              <p class="mb-4 leading-relaxed">
                Your use of the Service may be subject to additional terms, policies, and privacy
                statements of these third-party providers. You are responsible for reviewing and
                complying with such third-party terms. We are not responsible for the practices,
                policies, or actions of any third-party service.
              </p>
              <p class="mb-4 leading-relaxed">
                If we add advertising or other monetization services in the future, additional
                third-party terms, notices, or consent requests may apply.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">8.3 Service Availability</h3>
              <p class="leading-relaxed">
                The availability and functionality of the Service depends on these third-party
                providers. We are not liable for any interruption, degradation, or unavailability of
                the Service caused by third-party service outages, maintenance, or changes to their
                terms or APIs.
              </p>
            </section>
            <!-- 9. DISCLAIMERS AND WARRANTIES -->
            <section id="disclaimers">
              <h2 class="mb-4 text-2xl font-bold">9. Disclaimers and Warranties</h2>
              <h3 class="mt-6 mb-3 text-xl font-semibold">9.1 "AS IS" Provision</h3>
              <p class="mb-4 leading-relaxed">
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
                EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
                MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR ANY OTHER
                WARRANTY.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">9.2 No Warranty of Accuracy</h3>
              <p class="mb-4 leading-relaxed">
                We make no warranty, representation, or guarantee regarding:
              </p>
              <ul class="mb-4 ml-6 list-disc space-y-2">
                <li class="leading-relaxed">
                  The accuracy, completeness, reliability, or timeliness of any content, data, or
                  information provided through the Service
                </li>
                <li class="leading-relaxed">
                  The correctness of game data, quest information, item statistics, or any other
                  Escape from Tarkov-related content
                </li>
                <li class="leading-relaxed">
                  The uninterrupted, timely, secure, or error-free operation of the Service
                </li>
                <li class="leading-relaxed">That defects or errors will be corrected</li>
                <li class="leading-relaxed">
                  That the Service or servers are free of viruses or other harmful components
                </li>
              </ul>
              <h3 class="mt-6 mb-3 text-xl font-semibold">9.3 No Service Level Agreement</h3>
              <p class="mb-4 leading-relaxed">
                As a free, open-source, volunteer-maintained project, we do not guarantee any level
                of uptime, availability, response time, support, or maintenance. The Service may be
                discontinued, modified, or made unavailable at any time without notice or liability.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">9.4 Beta and Experimental Features</h3>
              <p class="mb-4 leading-relaxed">
                The Service may include beta, experimental, or work-in-progress features that may
                not function correctly, may contain bugs, and may be removed or changed without
                notice. Use of such features is entirely at your own risk.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">9.5 No Endorsement or Approval</h3>
              <p class="leading-relaxed">
                We make no representation that use of this Service is endorsed, approved,
                authorized, or permitted by Battlestate Games Limited, BattlEye Innovations, or any
                other game developer, publisher, or anti-cheat provider. You acknowledge that use of
                third-party tools, overlays, or tracking applications may be prohibited by game
                terms of service or may result in account penalties, suspensions, or bans.
              </p>
            </section>
            <!-- 10. LIMITATION OF LIABILITY -->
            <section id="liability">
              <h2 class="mb-4 text-2xl font-bold">10. Limitation of Liability</h2>
              <h3 class="mt-6 mb-3 text-xl font-semibold">10.1 Maximum Liability</h3>
              <p class="mb-4 leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL TARKOVTRACKER,
                ITS OPERATORS, CONTRIBUTORS, MAINTAINERS, AFFILIATES, OR ANY PARTY INVOLVED IN
                CREATING, PRODUCING, OR DELIVERING THE SERVICE BE LIABLE FOR ANY DIRECT, INDIRECT,
                INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT
                NOT LIMITED TO:
              </p>
              <ul class="mb-4 ml-6 list-disc space-y-2">
                <li class="leading-relaxed">
                  Loss of data, profits, revenue, business, or anticipated savings
                </li>
                <li class="leading-relaxed">
                  Loss of access to game accounts, including Escape from Tarkov accounts
                </li>
                <li class="leading-relaxed">
                  Account suspensions, bans, or restrictions (temporary or permanent)
                </li>
                <li class="leading-relaxed">
                  IP bans, hardware ID bans, or other technical restrictions
                </li>
                <li class="leading-relaxed">Damage to reputation or goodwill</li>
                <li class="leading-relaxed">Cost of procurement of substitute services</li>
                <li class="leading-relaxed">Any other intangible losses</li>
              </ul>
              <h3 class="mt-6 mb-3 text-xl font-semibold">10.2 Use at Your Own Risk</h3>
              <p class="mb-4 leading-relaxed">
                YOU EXPRESSLY UNDERSTAND AND AGREE THAT YOUR USE OF THE SERVICE IS ENTIRELY AT YOUR
                OWN RISK. You assume full responsibility for any consequences arising from your use
                of the Service, including but not limited to:
              </p>
              <ul class="mb-4 ml-6 list-disc space-y-2">
                <li class="leading-relaxed">
                  Actions taken by Battlestate Games, BattlEye, or other game service providers
                </li>
                <li class="leading-relaxed">
                  Actions taken by third-party authentication or hosting providers
                </li>
                <li class="leading-relaxed">Data loss or corruption</li>
                <li class="leading-relaxed">
                  Security breaches or unauthorized access to your accounts
                </li>
                <li class="leading-relaxed">
                  Inaccurate information leading to in-game decisions or resource allocation
                </li>
              </ul>
              <h3 class="mt-6 mb-3 text-xl font-semibold">10.3 No Liability for Third Parties</h3>
              <p class="mb-4 leading-relaxed">
                We are not liable for the actions, policies, terms, or practices of any third party,
                including but not limited to Battlestate Games, BattlEye, anti-cheat providers,
                OAuth authentication services, Supabase, Cloudflare, or any other service provider
                or platform.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">10.4 Jurisdictional Limitations</h3>
              <p class="leading-relaxed">
                Some jurisdictions do not allow the exclusion of certain warranties or the
                limitation or exclusion of liability for incidental or consequential damages.
                Accordingly, some of the above limitations may not apply to you. In such
                jurisdictions, our liability shall be limited to the greatest extent permitted by
                law.
              </p>
            </section>
            <!-- 11. INDEMNIFICATION -->
            <section id="indemnification">
              <h2 class="mb-4 text-2xl font-bold">11. Indemnification</h2>
              <p class="mb-4 leading-relaxed">
                You agree to defend, indemnify, and hold harmless TarkovTracker, its operators,
                contributors, maintainers, affiliates, licensors, and service providers, and their
                respective officers, directors, employees, contractors, agents, and representatives
                from and against any and all claims, damages, obligations, losses, liabilities,
                costs, debts, and expenses (including but not limited to attorney's fees) arising
                from:
              </p>
              <ul class="mb-4 ml-6 list-disc space-y-2">
                <li class="leading-relaxed">Your use of or access to the Service</li>
                <li class="leading-relaxed">Your violation of these Terms</li>
                <li class="leading-relaxed">
                  Your violation of any third-party rights, including intellectual property rights,
                  privacy rights, or terms of service
                </li>
                <li class="leading-relaxed">Your violation of any applicable law or regulation</li>
                <li class="leading-relaxed">
                  Any content you submit, post, or transmit through the Service
                </li>
                <li class="leading-relaxed">
                  Any actions taken by game developers, publishers, or anti-cheat providers in
                  response to your use of the Service
                </li>
              </ul>
              <p class="leading-relaxed">
                This indemnification obligation shall survive termination of these Terms and your
                use of the Service.
              </p>
            </section>
            <!-- 12. MODIFICATIONS TO SERVICE -->
            <section id="modifications">
              <h2 class="mb-4 text-2xl font-bold">12. Modifications to Service and Terms</h2>
              <h3 class="mt-6 mb-3 text-xl font-semibold">12.1 Service Changes</h3>
              <p class="mb-4 leading-relaxed">
                We reserve the right to modify, suspend, or discontinue the Service (or any part
                thereof) at any time, with or without notice, for any reason. We shall not be liable
                to you or any third party for any modification, suspension, or discontinuation of
                the Service.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">12.2 Terms Changes</h3>
              <p class="mb-4 leading-relaxed">
                We reserve the right to revise and update these Terms at any time. Changes will be
                effective immediately upon posting to the Service with an updated "Last Updated"
                date. Your continued use of the Service following any changes constitutes acceptance
                of those changes.
              </p>
              <p class="leading-relaxed">
                Material changes to these Terms may be announced through the Service interface, our
                GitHub repository, or associated community channels, but you are responsible for
                reviewing these Terms periodically.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">12.3 Future Monetization</h3>
              <p class="leading-relaxed">
                We reserve the right to introduce new features, services, or tiers that may require
                payment or subscription. While the core open-source codebase will remain available
                under GPLv3, hosted services and advanced features provided on our Platform may be
                subject to billing in the future.
              </p>
            </section>
            <!-- 13. TERMINATION -->
            <section id="termination">
              <h2 class="mb-4 text-2xl font-bold">13. Termination</h2>
              <h3 class="mt-6 mb-3 text-xl font-semibold">13.1 Termination by You</h3>
              <p class="mb-4 leading-relaxed">
                You may terminate your account and cease use of the Service at any time by
                discontinuing access and requesting deletion of your account through the Service
                settings.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">13.2 Termination by Us</h3>
              <p class="mb-4 leading-relaxed">
                We reserve the right to suspend or terminate your access to the Service, with or
                without notice, for any reason, including but not limited to:
              </p>
              <ul class="mb-4 ml-6 list-disc space-y-2">
                <li class="leading-relaxed">Violation of these Terms</li>
                <li class="leading-relaxed">Fraudulent, abusive, or illegal activity</li>
                <li class="leading-relaxed">Prolonged inactivity</li>
                <li class="leading-relaxed">
                  Extended periods of inactivity (defined as no login for a period exceeding 12
                  consecutive months). We will make reasonable efforts to notify you via the email
                  associated with your account prior to such deletion
                </li>
                <li class="leading-relaxed">Technical or security concerns</li>
                <li class="leading-relaxed">Discontinuation of the Service</li>
              </ul>
              <h3 class="mt-6 mb-3 text-xl font-semibold">13.3 Effect of Termination</h3>
              <p class="leading-relaxed">
                Upon termination, your right to use the Service will immediately cease. Provisions
                of these Terms that by their nature should survive termination shall survive,
                including but not limited to ownership provisions, warranty disclaimers, indemnity,
                and limitations of liability.
              </p>
            </section>
            <!-- 14. DISPUTE RESOLUTION -->
            <section id="disputes">
              <h2 class="mb-4 text-2xl font-bold">14. Dispute Resolution and Governing Law</h2>
              <h3 class="mt-6 mb-3 text-xl font-semibold">14.1 Informal Resolution</h3>
              <p class="mb-4 leading-relaxed">
                In the event of any dispute, claim, or controversy arising out of or relating to
                these Terms or the Service, the parties agree to first attempt to resolve the matter
                informally by contacting us through our GitHub repository or community channels.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">14.2 Governing Law</h3>
              <p class="mb-4 leading-relaxed">
                These Terms and any dispute or claim arising out of or in connection with them or
                their subject matter shall be governed by and construed in accordance with the laws
                of the State of Florida, United States, without regard to conflict of law
                provisions. Any legal action or proceeding relating to your access to or use of the
                Service shall be instituted in a state or federal court in Florida, and you agree to
                submit to the jurisdiction of such courts.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">14.3 Arbitration</h3>
              <p class="mb-4 leading-relaxed">
                If informal resolution is unsuccessful, any dispute shall be resolved through
                binding arbitration in accordance with the Commercial Arbitration Rules of the
                American Arbitration Association (AAA). The arbitration shall be conducted in
                English in the State of Florida (or remotely via videoconference by mutual
                agreement). Each party shall bear its own costs and fees, except that the filing
                fees shall be paid by the party initiating the arbitration. The arbitrator's
                decision shall be final and binding, and judgment may be entered in any court of
                competent jurisdiction.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">14.4 Class Action Waiver</h3>
              <p class="leading-relaxed">
                You agree that any dispute resolution proceedings will be conducted only on an
                individual basis and not in a class, consolidated, or representative action. You
                waive any right to participate in a class action lawsuit or class-wide arbitration.
              </p>
            </section>
            <!-- 15. MISCELLANEOUS -->
            <section id="misc">
              <h2 class="mb-4 text-2xl font-bold">15. Miscellaneous Provisions</h2>
              <h3 class="mt-6 mb-3 text-xl font-semibold">15.1 Entire Agreement</h3>
              <p class="mb-4 leading-relaxed">
                These Terms, together with any Privacy Policy and other legal notices published by
                us on the Service, constitute the entire agreement between you and TarkovTracker
                concerning your use of the Service.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">15.2 Severability</h3>
              <p class="mb-4 leading-relaxed">
                If any provision of these Terms is found to be invalid, illegal, or unenforceable,
                such provision shall be modified to the minimum extent necessary to make it valid
                and enforceable. If modification is not possible, the provision shall be severed,
                and the remaining provisions shall remain in full force and effect.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">15.3 Waiver</h3>
              <p class="mb-4 leading-relaxed">
                No waiver of any term of these Terms shall be deemed a further or continuing waiver
                of such term or any other term. Our failure to assert any right or provision under
                these Terms shall not constitute a waiver of such right or provision.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">15.4 Assignment</h3>
              <p class="mb-4 leading-relaxed">
                You may not assign or transfer these Terms or your rights hereunder, in whole or in
                part, without our prior written consent. We may assign these Terms at any time
                without notice or consent.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">15.5 Force Majeure</h3>
              <p class="mb-4 leading-relaxed">
                We shall not be liable for any failure to perform our obligations under these Terms
                where such failure results from causes beyond our reasonable control, including but
                not limited to acts of God, war, riot, embargoes, acts of civil or military
                authorities, fire, floods, accidents, network infrastructure failures, strikes, or
                shortages of transportation, facilities, fuel, energy, labor, or materials.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">15.6 Headings</h3>
              <p class="mb-4 leading-relaxed">
                The section headings in these Terms are for convenience only and have no legal or
                contractual effect.
              </p>
              <h3 class="mt-6 mb-3 text-xl font-semibold">15.7 Language</h3>
              <p class="leading-relaxed">
                These Terms are drafted in English. Any translation is provided for convenience
                only. In the event of any conflict between the English version and a translated
                version, the English version shall prevail.
              </p>
            </section>
            <!-- 16. CONTACT INFORMATION -->
            <section id="contact">
              <h2 class="mb-4 text-2xl font-bold">16. Contact Information</h2>
              <p class="mb-4 leading-relaxed">
                If you have any questions, concerns, or requests regarding these Terms or the
                Service, please contact us through:
              </p>
              <ul class="mb-4 ml-6 list-disc space-y-2">
                <li class="leading-relaxed">
                  <strong>Email (Legal & Compliance):</strong>
                  legal@tarkovtracker.org
                </li>
                <li class="leading-relaxed">
                  <strong>Email (General Support):</strong>
                  support@tarkovtracker.org
                </li>
                <li class="leading-relaxed">
                  <strong>GitHub Organization:</strong>
                  <a
                    href="https://github.com/tarkovtracker-org"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-link hover:text-link-hover underline"
                  >
                    https://github.com/tarkovtracker-org
                  </a>
                </li>
                <li class="leading-relaxed">
                  <strong>Issue Tracker:</strong>
                  Open an issue on our GitHub repository
                </li>
                <li class="leading-relaxed">
                  <strong>Community Channels:</strong>
                  Through our associated Discord server or community forums
                </li>
              </ul>
              <p class="mb-4 leading-relaxed">
                For legal notices, DMCA takedown requests, or other formal communications, please
                use the legal@tarkovtracker.org email address to ensure proper handling and
                response.
              </p>
              <p class="leading-relaxed">
                We will make reasonable efforts to respond to inquiries, but as a
                volunteer-maintained project, we cannot guarantee response times or resolution of
                issues.
              </p>
            </section>
            <!-- 17. ACKNOWLEDGMENT -->
            <section id="acknowledgment">
              <h2 class="mb-4 text-2xl font-bold">17. Acknowledgment</h2>
              <p class="mb-4 leading-relaxed">
                BY ACCESSING OR USING THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ THESE TERMS OF
                SERVICE, UNDERSTAND THEM, AND AGREE TO BE BOUND BY THEM. IF YOU DO NOT AGREE TO
                THESE TERMS, YOU MUST NOT ACCESS OR USE THE SERVICE.
              </p>
              <p class="mb-4 leading-relaxed">YOU FURTHER ACKNOWLEDGE AND AGREE THAT:</p>
              <ul class="mb-4 ml-6 list-disc space-y-2">
                <li class="leading-relaxed">Use of this Service is entirely at your own risk</li>
                <li class="leading-relaxed">
                  The Service is provided "as is" without any warranties
                </li>
                <li class="leading-relaxed">
                  We are not affiliated with Battlestate Games or Escape from Tarkov
                </li>
                <li class="leading-relaxed">
                  You may face consequences in Escape from Tarkov for using third-party tools
                </li>
                <li class="leading-relaxed">
                  We are not liable for any damages arising from your use of the Service
                </li>
                <li class="leading-relaxed">
                  You are responsible for compliance with all applicable terms of service and laws
                </li>
              </ul>
              <p class="leading-relaxed font-bold">
                Thank you for using TarkovTracker. Game responsibly.
              </p>
            </section>
          </div>
        </UCard>
      </section>
    </div>
    <!-- Mobile floating index -->
    <ClientOnly>
      <div class="fixed right-6 bottom-6 z-40 xl:hidden">
        <UPopover>
          <UButton
            icon="i-heroicons-list-bullet"
            color="primary"
            variant="solid"
            :label="t('page.terms_of_service.index_button')"
          />
          <template #content>
            <div class="max-h-96 w-64 space-y-1 overflow-y-auto p-2">
              <button
                v-for="item in toc"
                :key="item.id"
                type="button"
                :aria-current="activeId === item.id ? 'true' : undefined"
                class="hover:bg-primary-500/10 hover:text-primary-200 w-full rounded px-2 py-2 text-left text-sm transition"
                :class="
                  activeId === item.id
                    ? 'bg-primary-500/10 text-primary-200 border-primary-500/20 border'
                    : 'border border-transparent'
                "
                @click="scrollTo(item.id)"
              >
                {{ item.title }}
              </button>
            </div>
          </template>
        </UPopover>
      </div>
    </ClientOnly>
  </div>
</template>
