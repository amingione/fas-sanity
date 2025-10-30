import {EnvelopeIcon, SparkleIcon} from '@sanity/icons'
import {defineArrayMember, defineField, defineType} from 'sanity'

const outreachTemplates = [
  {
    _type: 'template',
    _key: 'template-01',
    title: 'Local Track Spotlight Backlink Request',
    campaignGoal:
      'Earn a backlink from regional motorsport blogs by offering a co-branded spotlight on high-traffic local tracks.',
    idealPartner: 'Regional racing news sites and motorsport bloggers covering local circuits.',
    contentAngle:
      'Share exclusive lap time data, fan amenities, and Canva-ready visuals to enrich their existing coverage.',
    subjectLine: 'Feature idea: Showcase {{partnerSite}} with new FAS Motorsports data',
    previewText: 'We assembled fresh track insights your readers will love—want the data pack?',
    body: `Hi {{firstName}},

I loved your recent coverage of {{trackName}} and how you captured the energy of the last race weekend. Our team at FAS Motorsports just finished a data-backed spotlight on the track's fastest laps, facility upgrades, and fan experience tips.

Would you be open to weaving the data into an updated post or co-authoring a feature? We can provide charts, imagery sized for Canva, and link back to your piece across our channels.

If it helps, I'm happy to send a draft outline or pull a quick quote from our crew chief to make the story pop.

Thanks for considering it!

{{senderName}}
Content Partnerships | FAS Motorsports`,
    callToAction: 'Reply to grab the track data pack and co-branded Canva graphics.',
    followUpPlan: 'Share a new data point and resend the Canva link four business days later if no response.',
    notes: 'Attach the latest local track infographic and include a direct link to the Canva folder.',
  },
  {
    _type: 'template',
    _key: 'template-02',
    title: 'Race Recap Collaboration',
    campaignGoal: 'Secure a backlink by contributing expert commentary to a partner race recap.',
    idealPartner: 'Motorsport recap blogs and YouTube channels that post Monday morning breakdowns.',
    contentAngle: 'Offer pit lane insights, strategy analysis, and Canva quote cards to embed in their recap.',
    subjectLine: 'Ready-to-use crew chief insights for your {{eventName}} recap',
    previewText: 'Add fresh quotes, data, and visuals from the FAS Motorsports garage.',
    body: `Hey {{firstName}},

Your {{eventName}} recap nailed the storylines, especially the late pit strategy. We had our race engineers dissect the stint data and pulled a few angles that would extend your coverage without extra lift.

If you're up for a collaboration update, we'll package:
• Exclusive quotes from our crew chief on the tire call
• Canva-ready graphics showing lap delta swings
• Links back to your recap in our newsletter and socials

Let me know if you'd like the files—we can have everything in your inbox within a few hours.

Best,
{{senderName}}
Performance Communications | FAS Motorsports`,
    callToAction: 'Ask for the recap asset pack and cross-promotion details.',
    followUpPlan: 'Follow up two days later with a GIF of the pivotal race moment and a shortened summary.',
    notes: 'Include a link to recent recap collaborations as social proof.',
  },
  {
    _type: 'template',
    _key: 'template-03',
    title: 'Technical Build Feature Pitch',
    campaignGoal: 'Land a guest post covering FAS Motorsports vehicle builds with a backlink to the shop page.',
    idealPartner: 'Automotive engineering blogs and enthusiast forums that publish deep-dive build stories.',
    contentAngle: 'Highlight the custom fabrication process, dyno results, and downloadable spec sheets.',
    subjectLine: 'Guest post pitch: Inside our {{buildName}} race build blueprint',
    previewText: 'Share our fabrication workflow with your engineering-focused readers.',
    body: `Hi {{firstName}},

I'm reaching out from FAS Motorsports with a behind-the-scenes build story your audience might enjoy. We recently wrapped the {{buildName}} project and documented the process from CAD to first shakedown.

We can deliver an original 1,200-word article that covers:
• The fabrication stack and why we chose each component
• Dyno graphs and track testing data (with Canva visual overlays)
• Downloadable spec sheets that live on your site with a credit link back to us

Happy to tailor the depth or angle so it fits your editorial calendar. If it sounds useful, I can send an outline or full draft this week.

Thanks!
{{senderName}}
Lead Fabricator | FAS Motorsports`,
    callToAction: 'Request the outline or draft to keep the collaboration moving.',
    followUpPlan: 'Nudge one week later with a short Loom walkthrough of the build bay.',
    notes: 'Include references to prior guest articles if available.',
  },
  {
    _type: 'template',
    _key: 'template-04',
    title: 'Event Preview Guest Article',
    campaignGoal: 'Place a guest article previewing an upcoming event with backlinks to FAS Motorsports resources.',
    idealPartner: 'City lifestyle outlets and motorsport fan blogs that publish event guides.',
    contentAngle: 'Provide agenda highlights, ticketing tips, and Canva schedules for easy publishing.',
    subjectLine: 'Want a ready-to-publish preview for {{eventName}}?',
    previewText: 'We mapped the must-see moments and fan tips so you don’t have to.',
    body: `Hi {{firstName}},

With {{eventName}} around the corner, we pulled together a fan-first guide covering the headline heats, autograph sessions, and best seats in the house. If you'd like, we can deliver a polished guest post that includes:
• A customizable Canva schedule graphic
• Insider notes from our paddock walk-through
• Links to exclusive FAS Motorsports footage you can embed

All we ask in return is an author bio link back to our event hub. Interested in taking a peek at the draft?

Cheers,
{{senderName}}
Community Marketing | FAS Motorsports`,
    callToAction: 'Ask for access to the draft Google Doc and Canva design.',
    followUpPlan: 'Send a reminder three days later featuring a short list of the biggest storylines to build urgency.',
    notes: 'Provide social copy snippets to make publication effortless.',
  },
  {
    _type: 'template',
    _key: 'template-05',
    title: 'Motorsport Podcast Backlink Swap',
    campaignGoal: 'Secure a guest appearance and reciprocal backlink from podcast show notes.',
    idealPartner: 'Motorsport and performance driving podcasts seeking expert guests.',
    contentAngle: 'Offer insights on data-driven race prep and share Canva audio quote cards for promotion.',
    subjectLine: 'Podcast idea: Data-backed race prep stories your listeners will replay',
    previewText: 'Our crew chief can break down strategy live and share assets for your show notes.',
    body: `Hey {{firstName}},

I tune into {{podcastName}} regularly and loved the segment on race analytics. Our crew chief, {{crewChiefName}}, is available for guest spots this month and brings trackside stories plus actionable prep frameworks.

If you're open to it, we can also:
• Provide Canva quote cards sized for Instagram stories
• Link to the episode across our newsletter and driver network
• Publish a companion article on FASMotorsports.com that credits your show

Would a quick briefing call next week work?

Thanks for considering it,
{{senderName}}
Media Relations | FAS Motorsports`,
    callToAction: 'Schedule a 15-minute pre-interview to lock in recording details.',
    followUpPlan: 'Share a sample question list and listener stats two days later to sweeten the pitch.',
    notes: 'Include a Calendly link in your signature when you send this email.',
  },
  {
    _type: 'template',
    _key: 'template-06',
    title: 'Regional Sponsor Roundup',
    campaignGoal: 'Earn backlinks by spotlighting regional sponsors and offering co-marketing assets.',
    idealPartner: 'Local business journals and sponsorship news blogs.',
    contentAngle: 'Highlight sponsor impact stories with Canva testimonial cards and data snapshots.',
    subjectLine: 'Shine a light on {{sponsorName}} in your next sponsor spotlight',
    previewText: 'We have impact stats and visuals ready to drop into your article.',
    body: `Hi {{firstName}},

We're celebrating {{sponsorName}}'s support ahead of the {{eventName}} weekend and thought it could fit your sponsor spotlight series. We tracked the partnership's ROI, community activations, and charitable tie-ins.

If you'd like a plug-and-play package, we can supply:
• Exclusive interview quotes with {{sponsorContact}}
• Canva testimonial graphics sized for web and LinkedIn
• Links back to the sponsor's landing page and our case study

Let me know if you'd like to review the assets!

Best regards,
{{senderName}}
Partnerships Lead | FAS Motorsports`,
    callToAction: 'Share the sponsor impact media kit with the publication.',
    followUpPlan: 'Send refreshed stats after the event if they haven’t responded within a week.',
    notes: 'Loop in the sponsor’s PR contact on the follow-up for extra momentum.',
  },
  {
    _type: 'template',
    _key: 'template-07',
    title: 'Garage Tour Guest Post',
    campaignGoal: 'Publish a behind-the-scenes photo tour guest post linking back to FAS Motorsports media hub.',
    idealPartner: 'Automotive lifestyle blogs and enthusiast magazines.',
    contentAngle: 'Offer a visual-first story showcasing shop culture, equipment, and team personalities.',
    subjectLine: 'Exclusive photo tour: Step inside the FAS Motorsports garage',
    previewText: 'We’ll deliver copy, captions, and Canva carousels ready for your CMS.',
    body: `Hello {{firstName}},

Readers keep asking for what really happens inside a pro motorsports garage, so we shot a guided tour of our FAS facility. If you're interested, we can package a guest feature with:
• 20+ edited photos, each with caption suggestions
• Canva carousels sized for the web and Instagram
• Short video loops that pair with the written story

We’d love an author bio link back to our media hub in return. Should I share the preview gallery?

Thanks!
{{senderName}}
Brand Storyteller | FAS Motorsports`,
    callToAction: 'Invite them to view the password-protected gallery and draft outline.',
    followUpPlan: 'Follow up in five days with a teaser GIF and a reminder about timely publication windows.',
    notes: 'Double-check photography usage rights are included in the attachment.',
  },
  {
    _type: 'template',
    _key: 'template-08',
    title: 'Community Charity Event Feature',
    campaignGoal: 'Earn coverage and backlinks for FAS Motorsports community outreach initiatives.',
    idealPartner: 'Local newspapers, community blogs, and charity-focused publications.',
    contentAngle: 'Showcase impact metrics, volunteer stories, and Canva infographics about donations.',
    subjectLine: 'Story idea: Racing for good at {{charityEventName}}',
    previewText: 'Help us spotlight the volunteers and families your readers root for.',
    body: `Hi {{firstName}},

We're hosting {{charityEventName}} next month to raise support for {{charityCause}} and would love to team up on coverage. The event brings together drivers, families, and community partners for a full day of on-track experiences.

We can share:
• Impact stats from last year's fundraiser
• Canva infographics highlighting the beneficiary stories
• Quotes from participants willing to be featured

Would you like advance access to the press kit?

Warmly,
{{senderName}}
Community Relations | FAS Motorsports`,
    callToAction: 'Provide the press kit link and confirm publication timing.',
    followUpPlan: 'Call the newsroom if no response within three days of the event.',
    notes: 'Embed a short testimonial video link when sending the kit.',
  },
  {
    _type: 'template',
    _key: 'template-09',
    title: 'Motorsport Safety Guide Contribution',
    campaignGoal: 'Contribute expert safety content with backlinks to FAS educational resources.',
    idealPartner: 'Driving schools, safety training blogs, and motorsport governing body websites.',
    contentAngle: 'Deliver a structured safety checklist with downloadable Canva posters.',
    subjectLine: 'Guest resource: Pro safety checklist for your readers',
    previewText: 'Share our pit-tested guide with embeddable visuals.',
    body: `Hello {{firstName}},

At FAS Motorsports we train dozens of drivers each season, and our safety coaches recently refreshed the pre-race checklist we use in the pits. I'd love to contribute a guest resource to {{partnerSite}} so your readers can benefit too.

We can provide:
• A 900-word article with actionable steps
• A printable Canva poster summarizing the checklist
• A co-branded PDF that you can host on your site with a backlink credit

Would that fit your editorial calendar?

Thank you,
{{senderName}}
Driver Development | FAS Motorsports`,
    callToAction: 'Offer to share the draft and downloadable assets for review.',
    followUpPlan: 'Resend a concise summary with the poster thumbnail one week later.',
    notes: 'Mention any certifications the safety team holds to build credibility.',
  },
  {
    _type: 'template',
    _key: 'template-10',
    title: 'High-Performance Parts Review Exchange',
    campaignGoal: 'Swap product reviews with industry sites to secure backlinks to FAS tuning services.',
    idealPartner: 'Aftermarket parts reviewers and tuning enthusiast blogs.',
    contentAngle: 'Share dyno data, installation notes, and Canva comparison charts.',
    subjectLine: 'Let’s trade dyno-tested parts reviews',
    previewText: 'We’ll deliver data-backed insights and promote your findings.',
    body: `Hi {{firstName}},

Your recent {{productName}} review was spot-on. We're installing the same setup on a customer build next week and can document the process for your readers.

We can deliver:
• Before-and-after dyno charts in Canva-ready formats
• Installation photos with step-by-step notes
• Reciprocal promotion in our newsletter and build gallery

All we ask is a backlink to our tuning services page in the published piece. Interested?

Best,
{{senderName}}
Performance Shop Manager | FAS Motorsports`,
    callToAction: 'Coordinate the publish date and share the asset folder.',
    followUpPlan: 'Check in 48 hours after the install with teaser results to maintain interest.',
    notes: 'Confirm disclosure language for sponsored content if needed.',
  },
  {
    _type: 'template',
    _key: 'template-11',
    title: 'Women in Motorsports Feature',
    campaignGoal: 'Highlight women on the FAS Motorsports team through guest features and backlink opportunities.',
    idealPartner: 'Diversity-in-sports blogs and STEM education outlets.',
    contentAngle: 'Share personal stories, mentorship programs, and Canva quote graphics.',
    subjectLine: 'Profile idea: Women leading the charge at FAS Motorsports',
    previewText: 'Interviews, mentorship stats, and visuals ready for your feature.',
    body: `Hello {{firstName}},

To celebrate Women in Motorsports Month we gathered stories from engineers, drivers, and students who power FAS Motorsports every weekend. We'd love to collaborate on a feature for {{partnerSite}}.

We can offer:
• Interview transcripts and high-res photography
• Canva quote graphics sized for web and social
• Program stats that demonstrate long-term impact

Could we send over the media kit for consideration?

All the best,
{{senderName}}
People & Culture | FAS Motorsports`,
    callToAction: 'Share the media kit and propose publication timing aligned with awareness days.',
    followUpPlan: 'Reach out again during the awareness week with a new pull quote if needed.',
    notes: 'Coordinate with featured talent for approval before pitching.',
  },
  {
    _type: 'template',
    _key: 'template-12',
    title: 'Track Day Tips Guest Column',
    campaignGoal: 'Provide actionable track day preparation tips in exchange for backlinks.',
    idealPartner: 'Track day communities, motorsport forums, and regional car clubs.',
    contentAngle: 'Offer checklist-driven advice, coaching tips, and Canva cheat sheets.',
    subjectLine: 'Guest column: Track day checklist your members can print',
    previewText: 'Keep drivers safe and fast with pro-level prep guidance.',
    body: `Hi {{firstName}},

Our driver coaches compiled the ultimate track day checklist after supporting dozens of amateur racers this season. It covers everything from pre-load inspections to data logging basics.

We can tailor the article to your community and include:
• A printable Canva checklist you can brand
• Optional video clips demonstrating key drills
• Links back to your forum inside our driver welcome emails

Interested in featuring it next month?

Thanks,
{{senderName}}
Driver Coaching Coordinator | FAS Motorsports`,
    callToAction: 'Send the draft checklist and confirm the publishing schedule.',
    followUpPlan: 'Post a teaser in their forum thread if there’s no reply within five days.',
    notes: 'Offer to answer member questions live in the comments.',
  },
  {
    _type: 'template',
    _key: 'template-13',
    title: 'Data-Driven Performance Analysis',
    campaignGoal: 'Guest publish an analytics breakdown that links back to FAS telemetry services.',
    idealPartner: 'Data-focused motorsport publications and engineering newsletters.',
    contentAngle: 'Reveal telemetry insights with interactive charts and Canva dashboards.',
    subjectLine: 'Exclusive telemetry breakdown for your next performance feature',
    previewText: 'We sliced our race data into charts your readers will binge.',
    body: `Hi {{firstName}},

Our analytics lab just wrapped a telemetry study on braking efficiency across three tracks. I think your readers at {{partnerSite}} would enjoy a guest article that turns the numbers into actionable takeaways.

We can include:
• Interactive charts (plus static Canva exports)
• Commentary from our lead data engineer
• Downloadable CSV snippets hosted on your site with proper credit

Should I send the executive summary?

Regards,
{{senderName}}
Telemetry Lead | FAS Motorsports`,
    callToAction: 'Share the executive summary and proposed outline.',
    followUpPlan: 'Send a short Loom walkthrough of the dashboards if there is silence after one week.',
    notes: 'Ensure data is anonymized and cleared for public release before pitching.',
  },
  {
    _type: 'template',
    _key: 'template-14',
    title: 'Motorsport Photography Collaboration',
    campaignGoal: 'Exchange high-quality photography for backlinks and credit in galleries.',
    idealPartner: 'Motorsport photo blogs, magazines, and Instagram curators.',
    contentAngle: 'Provide curated photo sets with Canva overlay options and storytelling captions.',
    subjectLine: 'Gallery collab: Trackside shots ready for your readers',
    previewText: 'Access curated images with captions and credit-ready overlays.',
    body: `Hello {{firstName}},

Our media crew shot thousands of frames at {{eventName}}, and we curated a set that matches the editorial style of {{partnerSite}}. We'd love to collaborate on a gallery feature.

Here's what we can share:
• 30 edited images with alt text and captions
• Canva templates for quote overlays and cover slides
• Backlink to your gallery from our weekend recap email

Can I send you the preview contact sheet?

Thanks in advance,
{{senderName}}
Creative Director | FAS Motorsports`,
    callToAction: 'Deliver the contact sheet and confirm crediting requirements.',
    followUpPlan: 'Follow up three days later with social-ready carousel previews.',
    notes: 'Include photographer credits and any licensing restrictions in the kit.',
  },
  {
    _type: 'template',
    _key: 'template-15',
    title: 'Esports Crossover Feature',
    campaignGoal: 'Pitch a story connecting real-world racing with FAS Motorsports’ sim program to secure backlinks.',
    idealPartner: 'Esports publications and sim racing communities.',
    contentAngle: 'Highlight shared data systems, coaching programs, and Canva comparison infographics.',
    subjectLine: 'Story pitch: Bridging pro racing and sim teams at FAS Motorsports',
    previewText: 'Data, coaching insights, and visuals that unite both paddocks.',
    body: `Hi {{firstName}},

We just wrapped a joint camp with our pro drivers and sim racing roster, and the cross-training results were wild. I think your esports audience would love the behind-the-scenes look.

We can package a feature that includes:
• Side-by-side telemetry comparisons (plus Canva infographics)
• Interviews with both the sim coach and race engineer
• A CTA pointing readers to your Discord alongside our academy page

Would that resonate with your content plans?

Cheers,
{{senderName}}
Sim Program Director | FAS Motorsports`,
    callToAction: 'Offer to share draft angles and invite their editor to the next sim session.',
    followUpPlan: 'Send a highlight reel clip if there is no reply within five days.',
    notes: 'Align publication timing with upcoming esports events for extra relevance.',
  },
  {
    _type: 'template',
    _key: 'template-16',
    title: 'Season Preview Expert Roundup',
    campaignGoal: 'Contribute expert predictions to roundup posts with backlinks to FAS insights.',
    idealPartner: 'Motorsport news aggregators and fan discussion sites.',
    contentAngle: 'Offer expert quotes, stats, and Canva prediction graphics.',
    subjectLine: 'Need expert picks for your {{seasonName}} preview?',
    previewText: 'We’ll deliver bold predictions and sharable graphics today.',
    body: `Hey {{firstName}},

As teams gear up for {{seasonName}}, we're assembling expert picks from inside the FAS Motorsports war room. Happy to contribute quotable insights to your roundup.

We can send:
• A concise paragraph on championship favorites and dark horses
• Canva graphics featuring the predictions for your article and socials
• Reciprocal promotion in our preview email (with a backlink to your piece)

Want us to send the quotes by end of day?

Thanks,
{{senderName}}
Head of Strategy | FAS Motorsports`,
    callToAction: 'Confirm the deadline and send the prediction quotes plus graphics.',
    followUpPlan: 'Ping them 48 hours before their publish date with a reminder and an extra stat.',
    notes: 'Align messaging with the official series media guidelines.',
  },
  {
    _type: 'template',
    _key: 'template-17',
    title: 'Fan Experience Enhancement Story',
    campaignGoal: 'Highlight fan-focused innovations with backlinks to event packages.',
    idealPartner: 'Tourism boards, travel blogs, and fan experience websites.',
    contentAngle: 'Share testimonials, itinerary ideas, and Canva packing guides.',
    subjectLine: 'Give your readers a VIP race weekend blueprint',
    previewText: 'From seating hacks to meet-and-greets—ready to publish.',
    body: `Hi {{firstName}},

Fans are asking how to make the most of race weekends, so we built a VIP experience blueprint covering travel tips, paddock tours, and hospitality upgrades.

We can contribute a guest post that includes:
• A day-by-day itinerary graphic built in Canva
• Quotes from fans who tried the package last season
• A backlink to our booking page with an exclusive reader perk

Can I send the outline for review?

Warm regards,
{{senderName}}
Fan Experience Manager | FAS Motorsports`,
    callToAction: 'Share the outline and reader perk code for approval.',
    followUpPlan: 'Follow up one week later with early booking stats to reinforce demand.',
    notes: 'Coordinate with ticketing to ensure the promo code is active before pitching.',
  },
  {
    _type: 'template',
    _key: 'template-18',
    title: 'Aftermarket Innovation Interview',
    campaignGoal: 'Pitch an interview with FAS innovators to earn backlinks to product pages.',
    idealPartner: 'Automotive innovation blogs and B2B manufacturing publications.',
    contentAngle: 'Spotlight R&D breakthroughs with Canva diagrams and prototype imagery.',
    subjectLine: 'Interview invite: Meet the engineers behind our latest aero package',
    previewText: 'Blueprints, data, and quotes prepped for your editorial team.',
    body: `Hello {{firstName}},

We recently released a new aero package that cut lap times by {{timeDelta}} at {{trackName}}. Our engineering lead is available for interviews and willing to share data that hasn't been published yet.

We can provide:
• Technical diagrams with Canva overlays to simplify complex concepts
• Approval-ready photography direct from the wind tunnel
• Links back to both your article and our product development page

Shall we schedule a 20-minute interview next week?

Best,
{{senderName}}
Engineering Communications | FAS Motorsports`,
    callToAction: 'Lock in the interview time and confirm talking points.',
    followUpPlan: 'Send a calendar invite and media kit immediately after they accept; follow up in three days if silent.',
    notes: 'Pre-clear any confidential data points before sharing.',
  },
  {
    _type: 'template',
    _key: 'template-19',
    title: 'Motorsport Education Resource',
    campaignGoal: 'Distribute educational resources to schools and earn backlinks to FAS Academy programs.',
    idealPartner: 'STEM educators, technical colleges, and youth programs.',
    contentAngle: 'Offer lesson plans, workshop decks, and Canva worksheets.',
    subjectLine: 'STEM lesson plan: Race engineering fundamentals for your students',
    previewText: 'Hands-on activities and worksheets mapped to national standards.',
    body: `Hi {{firstName}},

FAS Motorsports Academy just rolled out a lesson plan that brings race engineering into the classroom. We'd love to share it with {{partnerSite}} so educators everywhere can access it for free.

The resource pack includes:
• A slide deck and speaker notes
• Canva worksheets students can fill out digitally or print
• Suggested lab activities linking to real race telemetry (with citations back to us)

May I send you the download link?

Sincerely,
{{senderName}}
STEM Outreach | FAS Motorsports`,
    callToAction: 'Provide the download link and request a resource page backlink.',
    followUpPlan: 'Reach out again after two weeks with testimonials from teachers who piloted the lesson.',
    notes: 'Ensure FERPA-compliant data handling in all materials.',
  },
  {
    _type: 'template',
    _key: 'template-20',
    title: 'Holiday Racing Gift Guide',
    campaignGoal: 'Co-create a holiday gift guide that links to FAS merchandise and partner offers.',
    idealPartner: 'Holiday shopping blogs, affiliate sites, and motorsport lifestyle magazines.',
    contentAngle: 'Bundle curated gift ideas with Canva collage graphics and affiliate tracking notes.',
    subjectLine: 'Collab on a motorsport gift guide readers can shop today',
    previewText: 'We’ll share curated picks, product photos, and promo codes.',
    body: `Hey {{firstName}},

The holiday rush is starting and we curated a motorsport gift guide with gear from FAS Motorsports and our partners. Thought it could slot perfectly into your seasonal roundup.

We can deliver:
• Product blurbs and pricing in a ready-to-paste format
• Canva collage graphics sized for blog headers and Pinterest
• Trackable promo codes so you can measure conversions

Open to co-publishing the guide next week?

Cheers,
{{senderName}}
Merchandising Lead | FAS Motorsports`,
    callToAction: 'Coordinate publish dates and exchange promo code tracking details.',
    followUpPlan: 'Send updated inventory availability three days before the go-live date.',
    notes: 'Confirm affiliate attribution requirements before finalizing copy.',
  },
]

export const outreachEmailTemplateLibraryType = defineType({
  name: 'outreachEmailTemplateLibrary',
  title: 'Outreach Email Template Library',
  type: 'document',
  icon: SparkleIcon,
  groups: [
    {
      default: true,
      name: 'library',
      title: 'Template Library',
      icon: SparkleIcon,
    },
    {
      name: 'operations',
      title: 'Operations',
      icon: EnvelopeIcon,
    },
  ],
  initialValue: () => ({
    title: 'Outreach Email Template Library',
    libraryNotes:
      'Use these pre-built outreach scripts to pitch backlink swaps, guest posts, and community collaborations. Personalize the placeholders before sending.',
    templates: outreachTemplates.map((template) => ({...template})),
  }),
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      group: 'library',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'libraryNotes',
      title: 'Usage Notes',
      type: 'text',
      rows: 3,
      description: 'Guidance for customizing the templates before sending.',
      group: 'library',
    }),
    defineField({
      name: 'templates',
      title: 'Templates',
      type: 'array',
      group: 'library',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'template',
          title: 'Template',
          fields: [
            defineField({
              name: 'title',
              title: 'Template Title',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'campaignGoal',
              title: 'Campaign Goal',
              type: 'string',
            }),
            defineField({
              name: 'idealPartner',
              title: 'Ideal Partner',
              type: 'string',
            }),
            defineField({
              name: 'contentAngle',
              title: 'Content Angle',
              type: 'string',
            }),
            defineField({
              name: 'subjectLine',
              title: 'Subject Line',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'previewText',
              title: 'Preview Text',
              type: 'string',
            }),
            defineField({
              name: 'body',
              title: 'Email Body',
              type: 'text',
              rows: 12,
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'callToAction',
              title: 'Call to Action',
              type: 'string',
            }),
            defineField({
              name: 'followUpPlan',
              title: 'Follow-up Plan',
              type: 'text',
              rows: 3,
            }),
            defineField({
              name: 'notes',
              title: 'Internal Notes',
              type: 'text',
              rows: 2,
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'lastRefreshed',
      title: 'Last Refreshed',
      type: 'datetime',
      description: 'Update when templates are reviewed or revised.',
      group: 'operations',
    }),
    defineField({
      name: 'owner',
      title: 'Template Owner',
      type: 'string',
      description: 'Who maintains and approves these outreach templates.',
      group: 'operations',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      templates: 'templates',
      updated: 'lastRefreshed',
    },
    prepare({title, templates, updated}) {
      const total = templates?.length ?? 0
      const subtitleParts = [`${total} templates ready`]

      if (updated) {
        subtitleParts.push(`Updated ${new Date(updated).toLocaleDateString()}`)
      }

      return {
        title: title || 'Outreach Email Templates',
        subtitle: subtitleParts.join(' • '),
      }
    },
  },
})
