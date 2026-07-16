# DFN Frontend Architecture (`dfn-ui`)

**Codespace:** `dfn-ui` (separate open-source repository)
**Design Paradigm:** Palantir Gotham — Ontology-centric intelligence workspace
**Design System:** Blueprint.js v5 (`@blueprintjs/*`) — permanent dark mode
**Backend:** `dfn-discovery` REST API + `/api/v1/analytics/*`
**Last Updated:** 2026-07-16

---

## 1. Design Philosophy

`dfn-ui` is not a consumer dashboard. It is an **intelligence workspace** — the same class of
tool that analysts use to find patterns across heterogeneous, high-volume data. Adapted for
Nigerian manufacturing procurement, it means:

> **Every click surfaces intelligence, not just data.**

| Principle | Expression in `dfn-ui` |
|---|---|
| **Ontology-centric** | Factories, Jobs, and Recommendations are first-class *Objects* with typed properties, relationships, evidence, and timelines — not rows in a form |
| **Pivot navigation** | Clicking an object reference navigates *through* the graph; no dead ends |
| **Operator density** | 13px default body text; 36px table rows; 30–40% negative space; no decorative chrome |
| **Dark-first, permanent** | `Classes.DARK` applied to `<body>` at mount; no light-mode toggle exists |
| **Action specificity** | No "Submit". Actions are named: *Classify Job*, *Score Fit*, *Lock Recommendation* |
| **Evidence-driven** | Every score and assessment is backed by visible, citable sources in the UI |
| **Stale-over-empty** | Analysts never see a blank screen — stale data shows immediately with a staleness timestamp; fresh data replaces it silently via background polling |

---

## 2. Design System — Blueprint.js v5

### 2.1 Package Inventory

```bash
# Core design system
@blueprintjs/core          # Button, Card, Tag, Callout, Dialog, Drawer, Overlay,
                           # Spinner, Toast, Navbar, Tree, InputGroup, FormGroup,
                           # ControlGroup, NumericInput, HTMLSelect, Switch, Slider
@blueprintjs/icons         # 500+ SVG icons (16px / 20px, monochrome)
@blueprintjs/select        # Select2, MultiSelect2, Suggest2
@blueprintjs/table         # High-performance virtual-scrolled Column/Cell table
@blueprintjs/datetime2     # DateInput2, DateRangePicker2
```

### 2.2 Global Theme Application

```tsx
// app/layout.tsx
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';
import '@blueprintjs/table/lib/css/table.css';
import '@blueprintjs/select/lib/css/blueprint-select.css';
import '@blueprintjs/datetime2/lib/css/blueprint-datetime2.css';
import '../styles/dfn-tokens.css';    // DFN overrides on top of Blueprint
import '../styles/dfn-workspace.css'; // Workspace shell layout

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
        Classes.DARK = "bp5-dark"
        Applied to body so ALL Blueprint portals (Dialog, Popover, Tooltip)
        inherit dark theme automatically — Blueprint renders portals to document.body,
        so they must inherit from body, not a nested div.
      */}
      <body className="bp5-dark dfn-workspace-root">
        {children}
      </body>
    </html>
  );
}
```

### 2.3 Design Tokens

Blueprint defines its own CSS custom properties. DFN overrides these and adds semantic
DFN-specific tokens on top.

```css
/* dfn-tokens.css
 * Overrides Blueprint v5 CSS variables to match DFN Intelligence palette.
 * Blueprint dark background: #1C2127 (--blueprint-dark-app-background)
 * DFN uses a deeper navy to distinguish from Blueprint defaults.
 */

:root.bp5-dark,
.bp5-dark {
  /* Canvas layers (deepest to most elevated) */
  --dfn-canvas:          #080C12;   /* Investigation canvas backdrop */
  --dfn-surface:         #0D1117;   /* Primary panels, cards */
  --dfn-surface-raised:  #161B22;   /* Elevated: modals, popovers */
  --dfn-surface-overlay: #1C2333;   /* Hovered / active rows */

  /* Override Blueprint background tokens */
  --bp5-app-background-color:       var(--dfn-surface);
  --bp5-dark-app-background-color:  var(--dfn-canvas);
  --bp5-card-background-color:      var(--dfn-surface);

  /* Borders */
  --dfn-border-subtle:  #21262D;    /* Section dividers */
  --dfn-border-muted:   #30363D;    /* Interactive outlines */
  --dfn-border-focus:   #388BFD;    /* Focus rings (Blueprint uses --blue3) */

  --bp5-dark-divider-color: var(--dfn-border-subtle);

  /* Text */
  --dfn-text-primary:   #E6EDF3;
  --dfn-text-secondary: #8B949E;
  --dfn-text-muted:     #484F58;
  --dfn-text-inverse:   #0D1117;

  /* Accent — DFN Intelligence Blue; mapped to Blueprint blue intent */
  --dfn-blue:           #388BFD;    /* Primary CTA, selected state */
  --dfn-blue-hover:     #58A6FF;    /* Hover on blue */
  --dfn-blue-glow:      rgba(56, 139, 253, 0.12);

  --bp5-intent-primary: var(--dfn-blue);

  /* Status / Signal — Blueprint Intent tokens mapped to DFN signals */
  --dfn-green:   #3FB950;   /* Gate passed, operational, inspection passed */
  --dfn-amber:   #D29922;   /* Moderate confidence, open work order */
  --dfn-red:     #F85149;   /* Gate failed, critical gap, inspection failed */
  --dfn-purple:  #BC8CFF;   /* AI-generated content */
  --dfn-teal:    #39D353;   /* Live / real-time update indicator */

  --bp5-intent-success: var(--dfn-green);
  --bp5-intent-warning: var(--dfn-amber);
  --bp5-intent-danger:  var(--dfn-red);

  /* Score Bands — mirrors shared/constants/scoring.ts boundaries */
  --dfn-score-excellent: #3FB950;   /* >= 80 */
  --dfn-score-good:      #D29922;   /* 60-79 */
  --dfn-score-fair:      #E3B341;   /* 40-59 */
  --dfn-score-poor:      #F85149;   /* < 40 */
}

/* Typography — Blueprint uses system-ui by default; DFN overrides with operator fonts */
.bp5-dark {
  --dfn-font-data: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  --dfn-font-ui:   'Inter', 'IBM Plex Sans', system-ui, sans-serif;

  --bp5-font-family: var(--dfn-font-ui);
  --bp5-font-size: 13px;        /* Blueprint default: 14px; DFN operator density: 13px */
  --bp5-font-size-small: 11px;
}

/* Score value cells and data displays always monospaced */
.dfn-data, .dfn-score, .dfn-id, .dfn-coord {
  font-family: var(--dfn-font-data);
}
```

### 2.4 Blueprint Component → DFN Component Mapping

| DFN Component | Blueprint Primitive | Key Props |
|---|---|---|
| `FitScoreBadge` | `<Tag>` | `intent` from score band, `minimal` |
| `StatusBadge` | `<Tag>` | `intent={Intent.SUCCESS\|WARNING\|DANGER}`, `round` |
| `ConfidenceBadge` | `<Tag>` | `intent`, `icon={IconNames.CHART}` |
| `SeverityCallout` | `<Callout>` | `intent={Intent.DANGER\|WARNING}` |
| `ObjectActionBar` | `<ButtonGroup>` | `minimal`, `alignText="left"` |
| `PipelineProgress` | `<ProgressBar>` | `intent`, `stripes` while in-flight |
| `GlobalSearch` | `<Omnibar>` | `isOpen`, `onClose`, keyboard-driven |
| `PropertySheet` | `<HTMLTable>` | `condensed`, `bordered={false}` |
| `ObjectTree` | `<Tree>` | `contents` typed as `TreeNodeInfo[]` |
| `AlertList` | `<Callout>` list | `intent`, `icon` per alert type |
| `ToastStack` | `<OverlayToaster>` | `position={Position.BOTTOM_RIGHT}` |
| `ConfirmAction` | `<Alert>` | `intent={Intent.DANGER}` for destructive actions |
| `JobIntakeDrawer` | `<Drawer>` | `position={Position.RIGHT}`, `size="600px"` |
| `ContextPanel` | `<Drawer>` | `position={Position.RIGHT}`, `hasBackdrop={false}` |
| `EvidenceDialog` | `<Dialog>` | `isCloseButtonShown`, `canOutsideClickClose` |
| `ProcessSelect` | `<Select2>` | typed items from `/models/process-types` |
| `MaterialSelect` | `<Select2>` | typed items |
| `LocationSearch` | `<Suggest2>` | items from HERE geocode backend proxy |
| `DateRangeFilter` | `<DateRangePicker2>` | timeline view date range |
| `QueueStatusPill` | `<Tag>` | `intent`, `rightIcon={IconNames.PULSE}` when active |
| `ScoreBar` | `<ProgressBar>` | custom CSS class, no animation |
| `BriefingMenu` | `<Menu>` | `<MenuItem>` for Print, PDF, Share |
| `ColumnPicker` | `<Popover2>` + `<Menu>` | multi-select column visibility |
| `FilterChips` | `<TagInput>` | controlled, each chip = one filter rule |
| `WorkspaceTabBar` | `<Tabs>` | `animate`, board-level tabs |
| `FloorplanStatus` | `<Tooltip2>` | asset tooltip, `hoverOpenDelay={200}` |
| `PivotBreadcrumb` | `<Breadcrumbs>` | up to 5 pivot history items |

---

## 3. Object Model (Ontology)

`dfn-ui` treats every entity as a typed **Object** with consistent structure across views:

```
Object: Job
  Properties:  id · company_name · product_name · process_type
               material_type · volume_band · location · status
  Relationships: [N] Recommendations each linking to one Factory
  Evidence:    [N] Attachments (classified by AI extraction handler)
  Timeline:    submitted -> normalized -> analyzing -> scored -> recommended
  Briefing:    AI-generated 3-sentence synopsis (Presentation Layer)

Object: Factory
  Properties:  id · factory_name · locations · process_types
               capacity_band · certifications · active
  Relationships: [N] Assets (UpKeep) · [N] Inspections (SafetyCulture)
                 [N] Recommendations (jobs it has been matched to)
  Timeline:    Inspection events · Work order events

Object: Recommendation
  Properties:  fit_score · feasibility_score · confidence_score
               component_scores (JSONB) · rank · caveats
  Relationships: belongs to Job x Factory
  Evidence:    [N] extracted fields from attachments

Object Graph (edges):
  Job --------[yields]------> Recommendation
  Recommendation ---[for]---> Factory
  Factory ----[has]---------> Asset[]
  Asset ------[subject-of]--> Inspection[]
  Job --------[scored-against via Recommendation]---> Factory
```

---

## 4. Workspace Shell

The workspace is a **persistent three-panel layout** across all Blueprint-based Palantir products.

```
+------------------------------------------------------------------------+
| TopBar  48px  bg: --dfn-surface  border-bottom: --dfn-border-subtle   |
| [DFN logo]  [Board Tabs]         [Cmd+K Search]  [Queue Pill] [Avatar] |
+------------+----------------------------------+-------------------------+
|            |                                  |                         |
| Object     |  PRIMARY WORKSPACE               | CONTEXT PANEL           |
| Panel      |                                  |                         |
| Left       |  Graph | Table | Map |           | Right                   |
| 240px      |  Timeline | Briefing             | 320px                   |
| fixed      |                                  | collapsible to 40px     |
|            |  Fills remaining width           | icon rail               |
|            |                                  |                         |
+------------+----------------------------------+-------------------------+
| StatusBar  24px  [Pipeline: 3 active]  [Queue: 7 pending]  [last 12s] |
+------------------------------------------------------------------------+
```

### 4.1 TopBar (`<Navbar>`)

```tsx
<Navbar className="dfn-topbar">
  <Navbar.Group align={Alignment.LEFT}>
    <DFNLogoMark />
    <Navbar.Divider />
    <WorkspaceTabBar />          {/* <Tabs> — active board tabs */}
  </Navbar.Group>
  <Navbar.Group align={Alignment.RIGHT}>
    <GlobalSearchButton />       {/* opens <Omnibar> on click or Cmd+K */}
    <QueueStatusPill />          {/* <Tag> with pulse animation */}
    <Navbar.Divider />
    <UserMenuButton />           {/* <Button> opening <Menu> Popover */}
  </Navbar.Group>
</Navbar>
```

### 4.2 Left Object Panel (`<Tree>`)

```tsx
const treeContents: TreeNodeInfo[] = [
  {
    id: 'jobs',
    label: 'Jobs',
    icon: IconNames.DOCUMENT,
    isExpanded: true,
    childNodes: jobs.map((job) => ({
      id: job.id,
      label: job.company_name,
      secondaryLabel: <StatusBadge status={job.status} />,
      icon: IconNames.DOCUMENT,
    })),
  },
  {
    id: 'factories',
    label: 'Factories',
    icon: IconNames.OFFICE,
    childNodes: pinnedFactories.map(factoryToTreeNode),
  },
  {
    id: 'boards',
    label: 'Saved Boards',
    icon: IconNames.GRID_VIEW,
    childNodes: boards.map(boardToTreeNode),
  },
];

<Tree
  contents={treeContents}
  onNodeClick={handleNodePivot}
  onNodeExpand={handleExpand}
  onNodeCollapse={handleCollapse}
  className="dfn-object-tree"
/>
```

### 4.3 Right Context Panel (`<Drawer hasBackdrop={false}>`)

```tsx
<Drawer
  position={Position.RIGHT}
  size="320px"
  hasBackdrop={false}       // Non-blocking — workspace remains interactive
  isOpen={contextPanelOpen}
  canOutsideClickClose={false}
  className="dfn-context-panel"
  title={<ObjectHeader object={selectedObject} />}
>
  <div className={Classes.DRAWER_BODY}>
    <PropertySheet properties={selectedObject.properties} />
    <ComponentBreakdown scores={selectedObject.componentScores} />
    {selectedObject.type === 'recommendation' && (
      <EvidenceList evidence={selectedObject.evidence} />
    )}
  </div>
  <div className={Classes.DRAWER_FOOTER}>
    <ObjectActionBar object={selectedObject} onAction={dispatchAction} />
  </div>
</Drawer>
```

**ActionBar contents by object type:**

| Object | Actions |
|---|---|
| Job | `[Classify]` `[Enrich]` `[Score Fit]` `[Generate Brief]` |
| Factory | `[Enrich Site]` `[Refresh Market]` `[Open Floorplan]` |
| Recommendation | `[Lock Recommendation]` `[Export]` `[Pivot to Factory]` |

---

## 5. Primary Workspace Views

### 5.1 Graph View (default)

Force-directed object relationship graph. Library: **React Flow v12** with custom dark Blueprint-styled node types.

```
GraphCanvas  bg: --dfn-canvas
+-- GraphControls     (zoom in/out/fit/lock)
+-- GraphFilterBar    (<ButtonGroup minimal> filter by type/score band/status)
+-- JobNode
|   +-- [DOCUMENT icon]  [company / product]  StatusBadge
|   +-- process_type . material_type . volume_band  (secondary text color)
|   +-- [N recommendations]  [created relative time]
+-- FactoryNode
|   +-- [OFFICE icon]  [factory_name]  active/inactive Tag
|   +-- ProgressBar (fit score; animated fill on first render; no stripes)
|   +-- capacity_band . location.state
|   +-- [N certifications]  [inspection score if enriched]
+-- RecommendationEdge  (Job -> Factory)
|   +-- Label:  fit score Tag (color-coded by score band)
|   +-- Stroke: proportional to fit score (2-6px)
|   +-- Style:  dashed when gatePassed=false
+-- MiniMap  (160x100px, bottom-right)
```

**Interaction model:**
- **Single click** → select node, populate Context Panel
- **Double click** → pivot: expand graph to show connected objects
- **Right click** → `<ContextMenu2>`: `Enrich`, `Open Briefing`, `Pin to Board`, `Remove`
- **Drag** → manual position override (persists to board state in Zustand)
- **⌘+click** → multi-select for comparison table

### 5.2 Table View

```
TableToolbar
+-- ViewSwitcher      <ButtonGroup minimal>: Graph|Table|Map|Timeline|Briefing
+-- ColumnPicker      <Popover2> + checkboxes
+-- FilterBuilder     <TagInput> — filter chips (each chip = one filter rule)
+-- GroupBySelect     <HTMLSelect>: region / process_type / score band
+-- ExportMenu        <Popover2> + <Menu>: CSV, PDF Brief

VirtualTable  (TanStack Table v8 + TanStack Virtual)
  Row height: 36px default; 24px compact via toolbar toggle
  Handles 10,000+ rows without DOM thrashing

  Columns:
    [type icon]  [Name — pivot link]  [Fit — mono + bar]
    [Status Tag]  [Confidence]  [Location]
    [Enriched — amber if > 12h]  [Actions — icon buttons]
```

### 5.3 Map View

```
MapView  bg: --dfn-canvas
+-- HereMapContainer      (HERE Maps JS SDK dark basemap; render only)
+-- FactoryMarkerLayer    (radius = recommendation frequency, color = fit band)
+-- IsolineLayer          (delivery reachability zone from job origin)
+-- RouteLayer            (optimal route polyline for selected factory)
+-- ClusterHeatmapOverlay (job density from /api/v1/analytics/clusters)
+-- RegionBoundaryLayer   (Nigerian region GeoJSON outlines)
+-- MapSidebar            (200px right strip: legend + visible factory list)
```

> HERE API key is server-side only. All geocoding/routing runs via backend HERE adapters.
> The frontend receives pre-computed GeoJSON and renders it.

### 5.4 Timeline View

```
TimelineToolbar
+-- ObjectSelector    MultiSelect2 (which objects to include)
+-- EventTypeFilter   <SegmentedControl>: Inspections|WorkOrders|Jobs|Market
+-- ZoomControl       <ButtonGroup>: Day|Week|Month|Quarter|Year

TimelineCanvas  (custom SVG renderer)
+-- TimeAxis          (horizontal ruler snapping to zoom level)
+-- ObjectLane[]      (one lane per object)
|   +-- ObjectLabel   (left gutter 160px: icon + name)
|   +-- EventChip[]   (positioned by timestamp; Blueprint Tag styled)
|       +-- InspectionEvent  intent=SUCCESS|DANGER|WARNING
|       +-- WorkOrderEvent   intent=WARNING|DANGER
|       +-- JobEvent         intent=PRIMARY (blue)
|       +-- MarketEvent      intent=NONE (--dfn-purple)
+-- NowMarker         (vertical --dfn-red line at current timestamp)
```

### 5.5 Briefing View

Intelligence-grade brief for PDF export and stakeholder review.

```
BriefingView  max-width: 900px centered  bg: --dfn-surface

ClassificationBanner  "DFN DISCOVERY — SENSITIVE COMMERCIAL"
  Callout intent=WARNING full-width

BriefingHeader
  H1: Job: [company] / [product]
  GeneratedAt: timestamp + AI model used
  <ButtonGroup>: [Print] [Export PDF] [Share Link]

ExecutiveSummary  (AI 3-sentence synthesis)
  ConfidenceBadge  LOW|MEDIUM|HIGH Tag intent-colored

RecommendationBlock (Blueprint Card, one per ranked factory)
  RankBadge        #1, #2... (--dfn-blue, monospace, large)
  FactoryHeader    name . location . active Tag
  ScoreMatrix      Fit | Feasibility | Confidence (H1 mono numbers)
                   6-component breakdown HTMLTable below
  KeyStrengths     ul, max 4 items (--dfn-green left-border)
  KeyRisks         ul, max 3 items (--dfn-amber left-border)
  EvidenceHighlights  source Tag + confidence ProgressBar
  NextSteps        numbered action items

GapSection  (processes with no matched factory)
  GapRow: process_type . job_count . [NO COVERAGE] Tag danger intent
```

---

## 6. Job Intake — Structured Intelligence Form

`<Drawer position={Position.RIGHT} size="600px">` — preserves workspace context while open.

```tsx
<Drawer ... title="New Job — Manufacturing Intelligence Request">
  <StepRow steps={['Product', 'Process', 'Geography', 'Evidence']} current={step} />

  {/* Step 1: Product Context */}
  <FormGroup label="Company" labelInfo="(required)">
    <InputGroup id="company" large placeholder="e.g. Dangote Packaging Ltd." />
  </FormGroup>
  <FormGroup label="Additional context for AI extraction"
             helperText="Optional — paste spec sheet text">
    <TextArea id="intel-notes" fill growVertically />
  </FormGroup>

  {/* Step 2: Process Specification */}
  <FormGroup label="Process Type">
    <Select2<ProcessType>
      items={processTypes}
      itemRenderer={renderProcessItem}
      onItemSelect={setProcessType}
      popoverProps={{ minimal: true }}
    >
      <Button text={selectedProcess?.label ?? 'Select process...'} rightIcon="caret-down" />
    </Select2>
  </FormGroup>
  <Button
    intent={Intent.PRIMARY}
    icon={IconNames.PREDICTIVE_ANALYSIS}
    text="Extract from context"
    onClick={triggerAIClassify}     // calls POST /queue/classify-job immediately
    loading={classifying}
  />

  {/* Step 3: Geography */}
  <Suggest2<GeoLocation>
    items={[]}
    inputValueRenderer={(loc) => loc.formatted_address}
    itemRenderer={renderLocationItem}
    onQueryChange={debouncedGeocode}   // calls backend HERE geocode proxy
    onItemSelect={setLocation}
    popoverProps={{ minimal: true }}
  />

  {/* Step 4: Evidence Upload */}
  <AttachmentDropzone onFiles={handleFiles} />

  <div className={Classes.DRAWER_FOOTER}>
    <Button text="Save Draft" minimal onClick={saveDraft} />
    <Button intent={Intent.PRIMARY} text="Submit Job for Analysis"
            onClick={submitJob} loading={submitting} />
  </div>
</Drawer>
```

After submission: drawer closes. Job node appears on workspace graph with
`<Spinner size={SpinnerSize.SMALL}>` ring and `[ANALYZING]` Tag.
Status polls at 5s via `useJobPipeline(jobId)` until terminal state.

---

## 7. SVG Interactive Floorplan

### 7.1 Asset Node Format

```svg
<g
  id="asset-UPKEEP-123"
  data-asset-id="UPKEEP-123"
  data-asset-type="injection-molder"
  data-inspection-state="passed"
  data-work-order-status="none"
  data-last-inspection-date="2026-06-01"
  class="dfn-fp-asset"
>
  <rect class="fp-body" x="120" y="80" width="60" height="40" rx="3" />
  <text class="fp-label" x="150" y="105">IMM-01</text>
  <circle class="fp-status-dot" cx="174" cy="84" r="4" />
</g>
```

### 7.2 State Coloring

| Inspection | Work Order | Body fill | Dot | Blueprint class |
|---|---|---|---|---|
| `passed` | `none` | `--dfn-surface-raised` | `--dfn-green` | `.bp5-intent-success` |
| `passed` | `open` | `--dfn-surface-raised` | `--dfn-amber` | `.bp5-intent-warning` |
| `failed` | any | `rgba(248,81,73,0.12)` | `--dfn-red` + glow | `.bp5-intent-danger` |
| `overdue` | any | `rgba(248,81,73,0.22)` | `--dfn-red` + pulse | `.bp5-intent-danger` |
| `unknown` | any | `--dfn-surface-raised` | `--dfn-text-muted` | — |

### 7.3 Interaction

```tsx
<Tooltip2 content={<AssetTooltipContent asset={asset} />} hoverOpenDelay={200}>
  <g className={classNames('dfn-fp-asset', getAssetStateClass(asset))}
     onClick={() => selectAsset(asset)}
     onContextMenu={(e) => openContextMenu(e, asset)}>
    {/* SVG primitives */}
  </g>
</Tooltip2>
```

Filter bar (`<SegmentedControl>`): `All | Failed | Overdue | Work Orders Open`
— dims non-matching nodes via CSS `opacity: 0.25`.

---

## 8. Process Simulation (Phase 8+, Feature-Flagged)

`simulation.enabled = false`. Stubs render `<NonIdealState icon={IconNames.OFFLINE} title="Coming in Phase 8">`.

### Async Job Contract

```
POST /jobs/:jobId/simulate         -> 202 { simulationJobId }
GET  /jobs/:jobId/simulate/:simId  -> { status, progress, result? }
```

### Result Schema

```typescript
interface SimulationResult {
  flowDiagram: {
    nodes: SimNode[];
    edges: SimEdge[];
    bottlenecks: string[];          // Asset IDs with queue depth > threshold
    throughput_pph: number;
    cycle_time_hours: number;
    utilization_by_asset: Record<string, number>;   // 0.0-1.0
  };
}
```

Rendered as animated directed graph (dagre layout; SVG `stroke-dashoffset` animation
for flow direction). Bottleneck nodes render a pulsing `<Tag intent={Intent.DANGER}>`.

---

## 9. Intelligence Dashboard (Analytics Surface)

Uses the same workspace shell. Route prefix: `/intelligence`.

```
/intelligence  (default: GapMapView)
+-- NigeriaRegionMap    Choropleth (D3 + GeoJSON)
|   color = gap severity from /api/v1/analytics/gaps
|   Click region -> pivot to /intelligence/regions/:id
+-- GapAlertList        <Callout> per critical gap
    intent=DANGER for severity=critical
    intent=WARNING for severity=moderate

/intelligence/regions/:id
+-- RegionHeader   <H3> + Tags (state count, factory count, avg fit)
+-- ProcessCoverageChart  horizontal bar (D3) from /regions/:id/processes
+-- GapTable   sortable <HTMLTable condensed>, sorted by matchedFactories ASC

/intelligence/clusters
+-- BubbleMap   D3 bubble on HERE Maps base
    radius = jobCount, color = avgFitScore band

/intelligence/process-coverage
+-- TreemapChart  D3 treemap
    area = totalJobs, color = coverageStrength (none->weak->moderate->strong)

/intelligence/gaps
+-- GapRankTable  <HTMLTable condensed striped>
    columns: Process | Total Jobs | Matched Factories | Severity
    expandable row: top 3 regions with worst exposure
    <Tag intent={Intent.DANGER}> for critical rows
```

### Analytics Query Pattern

```typescript
// 5-min stale time; 15-min background refresh
export function useAnalyticsGaps(threshold = 2) {
  return useQuery({
    queryKey: ['analytics', 'gaps', threshold],
    queryFn: () => dfnFetch<GapAnalyticsResponse>(
      `/api/v1/analytics/gaps?threshold=${threshold}`
    ),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
```

---

## 10. Pivot Navigation

Every object reference is a pivot point.

| Click target | Pivot action |
|---|---|
| Factory name in a recommendation | Open Factory in Context Panel; offer "Expand in Graph" |
| Region in a gap table row | Navigate to `/intelligence/regions/:id` |
| Evidence source filename | Open `<Dialog>` with attachment viewer |
| Score component label | Open Component Detail drawer (data sources for this score) |
| Asset chip in floorplan | Asset panel: UpKeep work orders + inspection history |
| Job status badge in tree | Navigate to Job pipeline view |

**Pivot history** via `<Breadcrumbs>` in TopBar (up to 5 items, ⌘[ to go back):

```tsx
<Breadcrumbs
  items={pivotHistory.map((item) => ({
    text: item.label,
    icon: objectTypeIcon(item.type),
    onClick: () => restorePivot(item),
  }))}
/>
```

---

## 11. Technology Stack

| Layer | Library | Version | Rationale |
|---|---|---|---|
| Framework | **Next.js** | 14 | SSR briefing pages; RSC analytics |
| Language | **TypeScript** | 5+ | Shared types via `@dfn/shared` |
| Design System | **@blueprintjs/core** | v5 | Dense operator-grade; `Classes.DARK` global |
| DS Tables | **@blueprintjs/table** | v5 | Blueprint virtual table for property sheets |
| DS Select | **@blueprintjs/select** | v5 | `Select2`, `MultiSelect2`, `Suggest2`, `Omnibar` |
| DS Date | **@blueprintjs/datetime2** | v5 | `DateInput2`, `DateRangePicker2` |
| Data Fetch | **TanStack Query** | v5 | Stale-while-revalidate, pipeline polling |
| Graph | **React Flow** | v12 | Force-directed graph, custom dark nodes |
| Virtual Tables | **TanStack Table + Virtual** | v8 | 10k+ row virtual scrolling |
| Maps | **HERE Maps JS SDK** | 3.x | Frontend render only; key stays server-side |
| Charts | **D3.js** | v7 | Treemap, choropleth, bubble — full dark control |
| Timeline | Custom SVG | — | Sparse events; no heavy library |
| State | **Zustand** | v4 | Board, selected object, panel widths |
| Auth | Next.js middleware | — | PKCE flow per `dfn-docs/07-frontend-architecture.md` |
| Testing | **Vitest + Playwright** | — | Unit + E2E |
| Deployment | **Cloud Run** | — | Same pipeline as backend |

---

## 12. API Client Patterns

### 12.1 Typed fetch wrapper

```typescript
export class DFNApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'DFNApiError';
  }
}

export async function dfnFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${getSessionToken()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new DFNApiError(res.status, body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
```

### 12.2 Error display

```tsx
function QueryErrorCallout({ error }: { error: DFNApiError }) {
  return (
    <Callout intent={Intent.DANGER} icon={IconNames.WARNING_SIGN}
             title={`API Error ${error.status}`}>
      {error.message}
    </Callout>
  );
}
```

### 12.3 Pipeline polling

```typescript
export function useJobPipeline(jobId: string) {
  return useQuery({
    queryKey: ['jobs', jobId, 'status'],
    queryFn: () => dfnFetch<{ status: string }>(`/jobs/${jobId}`),
    refetchInterval: (query) => {
      const TERMINAL = ['recommended', 'published', 'failed'];
      return TERMINAL.includes(query.state.data?.status ?? '') ? false : 5_000;
    },
  });
}
```

### 12.4 Stale-while-revalidate

```typescript
export function useRecommendations(jobId: string) {
  return useQuery({
    queryKey: ['jobs', jobId, 'recommendations'],
    queryFn: () => dfnFetch<RecommendationPresentation[]>(
      `/recommendations?jobId=${jobId}`
    ),
    staleTime: 2 * 60 * 1000,
    refetchInterval: (query) => (query.state.data ? 30_000 : 5_000),
    placeholderData: keepPreviousData,   // Analysts never see blank
  });
}
```

---

## 13. Responsive Layout

`dfn-ui` is a desktop-first operator interface.

| Breakpoint | Layout |
|---|---|
| >= 1440px (Workstation) | Full three-panel: Object Panel + Workspace + Context Panel |
| 1024-1439px (Laptop) | Context Panel collapses to 40px icon rail by default |
| 768-1023px (Tablet) | Object Panel behind hamburger; Context Panel hidden |
| < 768px (Mobile) | Read-only Briefing view only; graph/maps/floorplan unavailable |

Graph, Floorplan, and Process Simulation are workstation-only. On tablet/mobile, a
`<NonIdealState icon={IconNames.DESKTOP} title="Use a workstation">` is displayed.

---

## 14. Feature Flag Gates

Resolved server-side from `GET /api/v1/orgs/:orgId/features`.
`<FeatureGate flag="...">` renders `null` when the flag is off. No client bypass.

| Feature | Flag key | Default | Tier |
|---|---|---|---|
| Full graph workspace | `workspace.graph` | `true` | All |
| Scoring breakdown | `scoring.breakdown` | `true` | All |
| Intelligence analytics | `analytics.enabled` | `true` | All |
| Cluster analytics | `analytics.clusters` | `true` | All |
| Floorplan viewer | `floorplan.enabled` | `false` | Verified factory data |
| Process simulation | `simulation.enabled` | `false` | Phase 8+ |
| Briefing PDF export | `export.pdf` | `true` | Pro+ |
| Board collaboration | `boards.collab` | `false` | Enterprise |

---

## 15. Open-Source Considerations

`dfn-ui` is MIT-licensed.

| Stays in `dfn-discovery` (closed source) | Ships in `dfn-ui` (open source) |
|---|---|
| Scoring weights and algorithm | Score display components |
| Enrichment service credentials | HERE Maps rendering layer |
| Recommendation engine logic | Graph visualization (React Flow nodes) |
| AI prompts and extraction instructions | Job intake form structure |
| Factory database contents | Analytics chart components |
| HERE API key | Blueprint design system wiring |

- HERE API key is never in the frontend build
- Feature flags are resolved server-side — no client bypass possible
- Analytics endpoints return aggregate counts only — no factory-level PII
- `@dfn/shared` types package is the only formal interface between repos
- PKCE auth flow is per `dfn-docs/07-frontend-architecture.md`
