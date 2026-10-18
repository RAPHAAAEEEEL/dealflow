---
version: 1
date: 2026-10-18
status: accepted by the Owner on 2026-10-18
---

# Screening Criteria

Screening uses these rules to decide whether a Sighting belongs to a startup in one of the three Lanes and whether it is early enough. Every Screening result records the version it was judged against. Changes come as Proposals and take effect only when the Owner accepts them.

## Stage Rule

A startup is early enough when it is before or around its first Institutional Round:

- founded at most 3 years ago,
- no announced round above about €3M,
- no Series A,
- headquarters or founding team in DACH.

Checked before Claude is asked, so they cost nothing:

- The legal form must be a company that can take venture money. In Switzerland that means an AG or a GmbH; sole proprietorships, branches, cooperatives, associations and foundations are discarded.
- A new commercial-register entry counts as founded recently.

## Lanes

### Specialised Robotics

From the thesis: specialised robots will win before humanoids do. The winners are robots that do one painful job better than anyone, sold per job done.

In the Lane:

- robots built for one specific job in a real setting: construction, logistics, agriculture, industrial production, inspection, lab or hospital work
- perception or control software that ships with such robots and gets better with every deployment
- teams that own training data from real sites

Not in the Lane:

- general-purpose humanoids
- resellers, integrators or distributors without their own robot
- consumer, hobby or education robots, and drones for photography
- engineering or consulting services for third parties

### Enterprise Agents

From the thesis: enterprise AI will be won in the layer nobody demos. The defensible companies sit on proprietary process data, not on the better model.

In the Lane:

- software whose AI agents execute business workflows inside a company's own systems and data (ERP, quality, finance, procurement, operations)
- the infrastructure that lets agents touch real workflows: permissions, context, audit trails
- B2B players in industrial software, mobility or deep tech that own their customers' workflows

Not in the Lane:

- chat interfaces or thin wrappers on generic data with no proprietary process data
- AI agencies, consulting, or software development for third parties
- marketing-content generators and consumer apps

### Deep-Tech Manufacturing

From the thesis: in deep tech, making is the bottleneck. The bet is on companies that build the machines for the making step.

In the Lane:

- toolmakers that own one production step for a new class of materials or devices: semiconductor equipment, photonics, battery and thin-film production, advanced materials
- teams that run AI models and robotic experiments in one loop (self-driving labs) and keep the process data
- process control, metrology and inspection for producing new materials or devices
- foundry-like services that make a customer's first devices from a new material

Not in the Lane:

- contract manufacturing of conventional products
- trading in materials, chemicals or components
- general machine building without new technology
- pure research institutes without a company
