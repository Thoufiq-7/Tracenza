import React, { useState, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Lock,
  Gavel,
  FileText,
  Sparkles,
  X,
} from 'lucide-react';
import type { TriageBundle } from '../../types';

// Custom Node Types
interface NodeData {
  title: string;
  status: 'green' | 'amber' | 'red' | 'locked' | 'center';
  subtitle?: string;
  code?: string;
  stage?: string;
  clause?: string;
  remediation?: string[];
  evidence?: { key: string; value: string }[];
  isCenter?: boolean;
  score?: number;
}

// Center Institution Anchor Node
const CenterInstitutionNode: React.FC<{ data: NodeData }> = ({ data }) => {
  return (
    <div className="w-80 bg-white rounded-2xl p-4 shadow-xl border-2 border-blue-700 text-left cursor-pointer transition-all hover:shadow-2xl">
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-700 border-2 border-white" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-700 border-2 border-white" />
      
      <div className="flex items-center justify-between mb-2">
        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 text-[10px] font-bold uppercase tracking-wider font-mono">
          Target Institution
        </span>
        <span className="text-[11px] font-mono text-slate-500 font-medium">
          {data.code || 'PID: 1-94820194'}
        </span>
      </div>
      <h3 className="font-bold text-slate-900 text-sm leading-snug">{data.title}</h3>
      <p className="text-[11px] text-slate-500 mt-0.5">{data.subtitle || 'Extension of Approval (EoA) AY 2026-27'}</p>

      <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-semibold text-slate-700 text-[11px]">Statutory Risk Index</span>
          <span className="font-bold font-mono text-rose-600">{data.score ?? 68}/100</span>
        </div>
        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-rose-600"
            style={{ width: `${data.score ?? 68}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-1">
          <span>0 (Pass)</span>
          <span className="text-rose-600 font-semibold">Deficiency Threshold</span>
          <span>100</span>
        </div>
      </div>
    </div>
  );
};

// Radar Surrounding Dependency Node
const BlockerNode: React.FC<{ data: NodeData }> = ({ data }) => {
  const isRed = data.status === 'red';
  const isAmber = data.status === 'amber';
  const isGreen = data.status === 'green';

  const borderClass = isRed
    ? 'border-2 border-rose-600 ring-2 ring-rose-100 bg-white'
    : isAmber
    ? 'border-2 border-amber-500 bg-white'
    : isGreen
    ? 'border-2 border-emerald-500 bg-white'
    : 'border-2 border-slate-300 bg-slate-50/80 opacity-80';

  const Icon = isRed ? ShieldAlert : isAmber ? AlertTriangle : isGreen ? CheckCircle2 : Lock;
  const iconColor = isRed
    ? 'text-rose-600'
    : isAmber
    ? 'text-amber-600'
    : isGreen
    ? 'text-emerald-600'
    : 'text-slate-400';

  return (
    <div className={`w-64 p-3.5 rounded-xl shadow-sm text-left transition-all hover:shadow-md cursor-pointer ${borderClass}`}>
      <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 bg-slate-500 border-2 border-white" />
      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 bg-slate-500 border-2 border-white" />

      <div className="flex items-start justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />
          <p className="font-semibold text-slate-900 text-xs truncate">{data.title}</p>
        </div>
        <span
          className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${
            isRed
              ? 'bg-rose-100 text-rose-800'
              : isAmber
              ? 'bg-amber-100 text-amber-800'
              : isGreen
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-slate-200 text-slate-700'
          }`}
        >
          {data.status}
        </span>
      </div>

      <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">{data.subtitle}</p>

      {data.stage && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono border-t border-slate-100 pt-1.5">
          <span>{data.stage}</span>
          <span className="text-blue-700 font-semibold hover:underline">Inspect →</span>
        </div>
      )}
    </div>
  );
};

const nodeTypes = {
  centerNode: CenterInstitutionNode,
  blockerNode: BlockerNode,
};

interface DependencyRadarProps {
  bundle?: TriageBundle | null;
  onInspectDocument?: (docId: string) => void;
}

export const DependencyRadar: React.FC<DependencyRadarProps> = ({ bundle }) => {
  const [filter, setFilter] = useState<'all' | 'red' | 'amber' | 'green'>('all');
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);

  const app = bundle?.application;
  const blockers = bundle?.approval_blockers || [];

  // Construct Graph Nodes dynamically from Application Bundle
  const initialNodes: Node[] = useMemo(() => {
    const institutionName = app?.institution_name || 'Apex Institute of Technology';
    const pid = app?.permanent_id || 'PID: 1-94820194';
    const riskScore = app?.risk_score ?? 68;

    return [
      // 1. Stage 1: Statutory Clearances (Left Column - Upstream)
      {
        id: 'node-ter',
        type: 'blockerNode',
        position: { x: 50, y: 50 },
        data: {
          title: 'TER Fee Payment',
          subtitle: '₹2,50,000 via BharatKosh Treasury Portal',
          status: 'green',
          stage: 'Stage 1: Statutory Clearances',
          clause: 'AICTE Approval Process Handbook (APH) Ch. I Clause 1.3 (TER Realization)',
          evidence: [
            { key: 'Challan Ref', value: '#BK-2026-094821' },
            { key: 'Status', value: 'Cleared by National Treasury' },
            { key: 'Date', value: '04-Feb-2026 11:04 IST' },
          ],
          remediation: ['No action required. Fee verified and sealed in audit ledger.'],
        },
      },
      {
        id: 'node-land-title',
        type: 'blockerNode',
        position: { x: 50, y: 190 },
        data: {
          title: 'Contiguous Land Title',
          subtitle: '7.8 Acres continuous ownership registered',
          status: 'green',
          stage: 'Stage 1: Statutory Clearances',
          clause: 'APH Ch. I Clause 2.1.2 (Minimum contiguous campus acres)',
          evidence: [
            { key: 'Revenue Deed', value: '4421/2006 (SRO Tambaram)' },
            { key: 'Measured Area', value: '7.82 Acres geodesically verified' },
            { key: 'Tahsildar Clearance', value: 'Endorsed & unencumbered' },
          ],
          remediation: ['Deed is intact and verified with State Revenue GIS.'],
        },
      },
      {
        id: 'node-building-plan',
        type: 'blockerNode',
        position: { x: 50, y: 330 },
        data: {
          title: 'Building Plan & Occupancy',
          subtitle: 'Form-16 Certified by Municipal Corporation',
          status: 'green',
          stage: 'Stage 1: Statutory Clearances',
          clause: 'APH Ch. II Clause 3.1 (Approved Structural Plan & Occupancy Certificate)',
          evidence: [
            { key: 'Permit No', value: 'BLD-2025-MC-0994' },
            { key: 'Architect Reg', value: 'COA/2012/48201' },
            { key: 'Carpet Area', value: '14,200 sq.m verified against blueprint' },
          ],
          remediation: ['Building dimensions cross-checked within ±5% tolerance.'],
        },
      },

      // 2. Stage 2: Cadre & Affiliation (Left-Center Column)
      {
        id: 'node-cadre',
        type: 'blockerNode',
        position: { x: 50, y: 470 },
        data: {
          title: 'Faculty Cadre Ratio',
          subtitle: '1:16.2 vs 1:15 Norm (Shortfall: 2 Assoc. Professors)',
          status: 'amber',
          stage: 'Stage 2: Cadre Compliance',
          clause: 'APH Ch. II Clause 1.4 (Faculty Cadre & Teacher-Student Ratio)',
          evidence: [
            { key: 'Required Cadre', value: '1 Principal, 4 Prof, 8 Assoc, 24 Asst' },
            { key: 'Current Roster', value: 'Short by 2 Associate Professors in ECE' },
            { key: 'AICTE Biometric sync', value: 'Awaiting monthly attendance sync' },
          ],
          remediation: [
            '1. Issue encrypted clarification notice to Head of Institution.',
            '2. Institution must upload Form-16 TDS and joining orders for pending posts.',
            '3. Scrutiny committee re-evaluates ratio within 7 working days.',
          ],
        },
      },
      {
        id: 'node-university-noc',
        type: 'blockerNode',
        position: { x: 50, y: 610 },
        data: {
          title: 'University Affiliation NOC',
          subtitle: 'Affiliating University Provisional Syndicate Approval',
          status: 'amber',
          stage: 'Stage 2: Cadre Compliance',
          clause: 'APH Ch. I Clause 4.2 (State / University NOC)',
          evidence: [
            { key: 'Affiliating Body', value: 'Anna University / State DTE' },
            { key: 'Current Document', value: 'Provisional letter dated Nov 2025' },
            { key: 'Permanent NOC', value: 'Syndicate resolution pending scheduled meeting' },
          ],
          remediation: [
            '1. Awaiting formal Syndicate minute extract from University Registrar.',
            '2. Provisional clearance granted subject to final syndicate copy.',
          ],
        },
      },

      // 3. CENTER NODE: Target Institution Application
      {
        id: 'node-center',
        type: 'centerNode',
        position: { x: 420, y: 280 },
        data: {
          title: institutionName,
          subtitle: 'Extension of Approval (EoA) • Academic Year 2026-27',
          code: pid,
          isCenter: true,
          score: riskScore,
          stage: 'Current Scrutiny Cycle',
          clause: 'AICTE Institutional Approval Governance Framework',
          evidence: [
            { key: 'Category', value: app?.category || 'Extension of Approval' },
            { key: 'Requested Intake', value: `${app?.requested_intake || 420} Students` },
            { key: 'Active Red Blockers', value: `${blockers.length || 2} Critical Breaches` },
          ],
          remediation: [
            'Resolve all Critical Stage 3 blockers before official EoA order can be dispatched.',
          ],
        },
      },

      // 4. Stage 3: Critical Approval Blockers (Right Column)
      {
        id: 'node-lease-expired',
        type: 'blockerNode',
        position: { x: 840, y: 120 },
        data: {
          title: 'Campus Land Lease Overdue',
          subtitle: 'Registered lease expired 31-Jan-2026; 30-year term violated',
          status: 'red',
          stage: 'Stage 3: Critical Approval Blocker',
          clause: 'APH Ch. I Clause 2.1.4 (Mandatory 30-Year Continuous Land Lease)',
          evidence: [
            { key: 'Original Lease Date', value: '01-Feb-2006 (Term: 20 Years)' },
            { key: 'Expiry Date', value: '31-Jan-2026 (Expired 89 days ago)' },
            { key: 'Deficiency Violation', value: 'No registered extension registered with Sub-Registrar' },
          ],
          remediation: [
            '1. Institution must furnish registered Supplementary Lease Extension for minimum 30 years.',
            '2. Endorsement by District Revenue Officer (DRO) required.',
            '3. Sworn affidavit on ₹100 non-judicial stamp paper confirming peaceful possession.',
          ],
        },
      },
      {
        id: 'node-fire-noc',
        type: 'blockerNode',
        position: { x: 840, y: 270 },
        data: {
          title: 'Fire & Life Safety NOC Lapsed',
          subtitle: 'State Fire & Rescue Services NOC expired without renewal',
          status: 'red',
          stage: 'Stage 3: Critical Approval Blocker',
          clause: 'APH Ch. II Clause 2.3 (Fire and Life Safety Statutory Clearance)',
          evidence: [
            { key: 'Certificate Number', value: 'TN-FRS-NOC-2023-894' },
            { key: 'Validity Lapsed', value: '15-Mar-2026' },
            { key: 'Tamper Detection', value: 'Whiteout overlay suspected on date field' },
          ],
          remediation: [
            '1. Submit valid renewal certificate issued by Director of Fire Services.',
            '2. QR Code on certificate must verify successfully against state registry.',
            '3. Officer spot inspection mandatory if qr verification fails.',
          ],
        },
      },
      {
        id: 'node-lab-photo',
        type: 'blockerNode',
        position: { x: 840, y: 420 },
        data: {
          title: 'Computer Lab Infrastructure Deficit',
          subtitle: 'YOLOv8 detected fewer workstations than mandatory ratio',
          status: 'red',
          stage: 'Stage 3: Critical Approval Blocker',
          clause: 'APH Norms: Min 150 networked terminals for 300 intake',
          evidence: [
            { key: 'Detected Count', value: '28 monitors in uploaded lab photograph' },
            { key: 'Mandatory Requirement', value: '150 active workstations' },
            { key: 'Forensics Flag', value: 'Placeholder or low-resolution image detected' },
          ],
          remediation: [
            '1. Upload verified high-resolution panoramic video or geotagged photos of Computer Centre.',
            '2. Provide valid asset register matching invoice serial numbers.',
          ],
        },
      },

      // 5. Stage 4: Downstream Locked Milestone
      {
        id: 'node-final-eoa',
        type: 'blockerNode',
        position: { x: 840, y: 580 },
        data: {
          title: 'Issuance of EoA Order 2026-27',
          subtitle: 'Formal approval order locked pending resolution of Stage 3 deficiencies',
          status: 'locked',
          stage: 'Stage 4: Downstream Milestone',
          clause: 'Statutory Approval Order Execution Barrier',
          evidence: [
            { key: 'Status', value: 'Approval Locked' },
            { key: 'Active Upstream Gates', value: '3 Active Blockers Unresolved' },
          ],
          remediation: [
            'All red and amber nodes must be approved or overridden before this milestone can be executed.',
          ],
        },
      },
    ];
  }, [app, blockers]);

  // Edges connecting upstream to center, and center to blockers and final milestone
  const initialEdges: Edge[] = useMemo(() => [
    // Upstream to Center
    { id: 'e-ter-center', source: 'node-ter', target: 'node-center', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    { id: 'e-land-center', source: 'node-land-title', target: 'node-center', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    { id: 'e-bld-center', source: 'node-building-plan', target: 'node-center', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    { id: 'e-cadre-center', source: 'node-cadre', target: 'node-center', style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '4 4' } },
    { id: 'e-noc-center', source: 'node-university-noc', target: 'node-center', style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '4 4' } },

    // Center to Critical Blockers (Red Edges)
    {
      id: 'e-center-lease',
      source: 'node-center',
      target: 'node-lease-expired',
      animated: true,
      style: { stroke: '#e11d48', strokeWidth: 2.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#e11d48' },
    },
    {
      id: 'e-center-fire',
      source: 'node-center',
      target: 'node-fire-noc',
      animated: true,
      style: { stroke: '#e11d48', strokeWidth: 2.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#e11d48' },
    },
    {
      id: 'e-center-lab',
      source: 'node-center',
      target: 'node-lab-photo',
      animated: true,
      style: { stroke: '#e11d48', strokeWidth: 2.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#e11d48' },
    },

    // Blockers to Locked Final Milestone
    { id: 'e-block-final-1', source: 'node-lease-expired', target: 'node-final-eoa', style: { stroke: '#94a3b8', strokeDasharray: '5 5' } },
    { id: 'e-block-final-2', source: 'node-fire-noc', target: 'node-final-eoa', style: { stroke: '#94a3b8', strokeDasharray: '5 5' } },
  ], []);

  // Filter nodes according to selection
  const filteredNodes = useMemo(() => {
    if (filter === 'all') return initialNodes;
    return initialNodes.filter(
      (n) => n.id === 'node-center' || (n.data as unknown as NodeData).status === filter || (n.data as unknown as NodeData).status === 'locked'
    );
  }, [initialNodes, filter]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node.data as unknown as NodeData);
  }, []);

  return (
    <div className="relative w-full h-[780px] bg-slate-50/70 rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Top Controls Bar */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-700 text-white flex items-center justify-center shadow-xs">
            <Gavel className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Compliance Dependency Radar &amp; Resolution Graph
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Directed Acyclic Graph (DAG) • AICTE Approval Process Handbook (APH) Topology
            </p>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              filter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Nodes
          </button>
          <button
            onClick={() => setFilter('green')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              filter === 'green' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-emerald-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Satisfied
          </button>
          <button
            onClick={() => setFilter('amber')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              filter === 'amber' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600 hover:text-amber-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Warnings
          </button>
          <button
            onClick={() => setFilter('red')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              filter === 'red' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600 hover:text-rose-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-600" />
            Critical Blockers
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative w-full h-full">
        <ReactFlow
          nodes={filteredNodes}
          edges={initialEdges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={1.5}
          attributionPosition="bottom-left"
        >
          <Background color="#cbd5e1" gap={20} size={1} />
          <Controls className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden" />
          <MiniMap
            nodeColor={(node) => {
              const status = (node.data as unknown as NodeData).status;
              if (status === 'red') return '#e11d48';
              if (status === 'amber') return '#f59e0b';
              if (status === 'green') return '#10b981';
              return '#1e3a8a';
            }}
            className="border border-slate-200 rounded-xl overflow-hidden shadow-sm m-3"
            style={{ width: 140, height: 90 }}
          />
        </ReactFlow>

        {/* Legend Overlay */}
        <div className="absolute bottom-4 left-4 z-10 bg-white/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 shadow-sm text-xs space-y-1.5 pointer-events-none">
          <p className="font-bold text-[10px] uppercase tracking-wider text-slate-500">Legend</p>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-700 text-[11px]">Satisfied Statutory Bound</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-slate-700 text-[11px]">Compliance Warning (Re-Scrutiny)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
            <span className="text-slate-700 text-[11px] font-semibold">Critical Approval Blocker</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span className="text-slate-700 text-[11px]">Downstream Locked Milestone</span>
          </div>
        </div>

        {/* Slide-over Inspection Drawer for Selected Node */}
        {selectedNode && (
          <aside className="absolute top-0 right-0 bottom-0 w-96 bg-white border-l border-slate-200 shadow-2xl z-20 flex flex-col p-5 overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    selectedNode.status === 'red'
                      ? 'bg-rose-100 text-rose-800'
                      : selectedNode.status === 'amber'
                      ? 'bg-amber-100 text-amber-800'
                      : selectedNode.status === 'green'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {selectedNode.status} status
                </span>
                <h3 className="font-bold text-slate-900 text-base mt-1.5 leading-snug">
                  {selectedNode.title}
                </h3>
                <p className="text-xs text-slate-500">{selectedNode.stage || 'APH Verification Node'}</p>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 py-4">
              {/* Clause Reference */}
              {selectedNode.clause && (
                <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200/80">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-800 font-mono mb-1 flex items-center gap-1">
                    <Gavel className="w-3 h-3" /> Handbook Reference
                  </p>
                  <p className="text-xs text-slate-800 leading-relaxed font-medium">
                    {selectedNode.clause}
                  </p>
                </div>
              )}

              {/* Evidence Parameters */}
              {selectedNode.evidence && selectedNode.evidence.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-500" /> Evidence Audit Trail
                  </h4>
                  <div className="space-y-1.5">
                    {selectedNode.evidence.map((ev, i) => (
                      <div key={i} className="flex justify-between items-start p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                        <span className="text-slate-500">{ev.key}:</span>
                        <span className="font-semibold text-slate-800 text-right font-mono text-[11px] max-w-[180px] break-words">
                          {ev.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Remediation Protocol */}
              {selectedNode.remediation && selectedNode.remediation.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Resolution Steps
                  </h4>
                  <ul className="space-y-2">
                    {selectedNode.remediation.map((step, idx) => (
                      <li key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-normal">
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mt-auto pt-4 border-t border-slate-100">
              <button
                onClick={() => setSelectedNode(null)}
                className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Node Inspector
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
