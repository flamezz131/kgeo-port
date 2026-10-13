"use client";

import { useState } from "react";
import { updateRoadmapTaskStatus } from "@/app/actions/roadmap-actions";

export interface RoadmapTask {
  id: string;
  task_key: string;
  category: string | null;
  title: string;
  description: string | null;
  priority: string | null;
  status: "not_started" | "in_progress" | "completed" | "archived";
  target_outcome: string | null;
  estimated_duration: string | null;
  phase: number | null;
  university_program_id: string | null;
}

interface UniRequirement {
  university?: string;
  program?: string;
  requirement?: string;
}

export function RoadmapTaskTracker({ tasks }: { tasks: RoadmapTask[] }) {
  const [localTasks, setLocalTasks] = useState(tasks);
  const [isUpdating, setIsUpdating] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState<Record<number, boolean>>({});

  // Group tasks by phase
  const groupedTasks = localTasks
    .filter(t => t.status !== "archived")
    .reduce((acc, task) => {
      const phase = task.phase || 99;
      if (!acc[phase]) acc[phase] = [];
      acc[phase].push(task);
      return acc;
    }, {} as Record<number, RoadmapTask[]>);

  const phases = Object.keys(groupedTasks).map(Number).sort((a, b) => a - b);

  const toggleStatus = async (taskId: string, currentStatus: string) => {
    if (isUpdating) return;
    
    // Group identical tasks in the same phase so they are updated together
    const targetTask = localTasks.find(t => t.id === taskId);
    if (!targetTask) return;
    
    const targetTitle = targetTask.title.trim().toLowerCase();
    const relatedTaskIds = localTasks
      .filter(t => t.phase === targetTask.phase && t.title.trim().toLowerCase() === targetTitle)
      .map(t => t.id);

    // Quick local cycle: not_started -> in_progress -> completed -> not_started
    let nextStatus: "not_started" | "in_progress" | "completed" = "in_progress";
    if (currentStatus === "in_progress") nextStatus = "completed";
    if (currentStatus === "completed") nextStatus = "not_started";

    setIsUpdating(true);
    try {
      // Optimistic update
      setLocalTasks(prev => 
        prev.map(t => relatedTaskIds.includes(t.id) ? { ...t, status: nextStatus } : t)
      );
      
      await Promise.all(relatedTaskIds.map(id => updateRoadmapTaskStatus(id, nextStatus)));
    } catch (err) {
      console.error(err);
      // Revert on error
      setLocalTasks(tasks);
    } finally {
      setIsUpdating(false);
    }
  };

  const togglePhase = (phase: number) => {
    setExpandedPhases(prev => ({ ...prev, [phase]: !prev[phase] }));
  };

  if (phases.length === 0) {
    return <div className="text-sm text-gray-500">No active roadmap tasks.</div>;
  }

  // Determine current stage and next best action
  let currentStagePhase: number | null = null;
  let nextBestAction: RoadmapTask | null = null;

  for (const phase of phases) {
    const phaseTasks = groupedTasks[phase];
    const isIncomplete = phaseTasks.some(t => t.status !== "completed");
    if (isIncomplete) {
      currentStagePhase = phase;
      nextBestAction = phaseTasks.find(t => t.status === "in_progress") || phaseTasks.find(t => t.status === "not_started") || null;
      break;
    }
  }

  return (
    <div className="space-y-8">
      
      {/* NEXT BEST ACTION WIDGET */}
      {currentStagePhase && nextBestAction && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 shadow-sm mb-12">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center shrink-0 shadow-sm font-bold text-lg">
              {currentStagePhase.toString().padStart(2, '0')}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-1">Your Current Stage</p>
              <h3 className="text-xl font-black text-[#0B1F3A]">{nextBestAction.category || `Stage ${currentStagePhase}`}</h3>
              
              <div className="mt-4 bg-white border border-blue-100 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Next Best Action</p>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-base font-bold text-[#0B1F3A]">{nextBestAction.title}</h4>
                    {nextBestAction.estimated_duration && (
                      <p className="text-sm text-gray-500 mt-1">Estimated: {nextBestAction.estimated_duration}</p>
                    )}
                  </div>
                  <button 
                    disabled={isUpdating}
                    onClick={() => toggleStatus(nextBestAction!.id, nextBestAction!.status)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors"
                  >
                    {nextBestAction.status === 'not_started' ? 'Start Task' : 'Mark Completed'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ROADMAP TIMELINE */}
      <div className="relative before:absolute before:inset-0 before:ml-5 md:before:ml-6 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-blue-200 before:via-[#DCE6F2] before:to-transparent space-y-12 pl-12 md:pl-16">
        {phases.map((phase) => {
          const phaseTasks = groupedTasks[phase];
          const completedCount = phaseTasks.filter(t => t.status === "completed").length;
          const totalCount = phaseTasks.length;
          const progressPercent = Math.round((completedCount / totalCount) * 100);
          const isExpanded = expandedPhases[phase] ?? (phase === currentStagePhase);
          const isCompleted = completedCount === totalCount;
          
          const firstTask = phaseTasks[0];
          const stageTitle = firstTask.category || `Stage ${phase}`;
          
          let stageDesc = "";
          let stagePriority = firstTask.priority || "MEDIUM";
          let uniReqs: UniRequirement[] = [];

          try {
            if (firstTask.description && firstTask.description.startsWith("{")) {
              const parsed = JSON.parse(firstTask.description);
              if (parsed.is_rich_format) {
                stageDesc = parsed.stage_description;
                stagePriority = parsed.stage_priority || stagePriority;
                uniReqs = parsed.university_requirements || [];
              }
            }
          } catch {
            // Not rich format, ignore
          }

          return (
            <div key={phase} className="relative group">
              {/* Timeline dot */}
              <div className={`absolute -left-12 md:-left-16 mt-6 w-10 h-10 rounded-full border-4 border-white flex items-center justify-center shrink-0 shadow-sm z-10 transition-colors ${isCompleted ? 'bg-emerald-500 text-white' : phase === currentStagePhase ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <span className="text-sm font-bold">{phase === 99 ? '*' : phase.toString().padStart(2, '0')}</span>
                )}
              </div>

              {/* Stage Card */}
              <div className={`bg-white rounded-2xl border transition-all ${phase === currentStagePhase ? 'border-blue-300 shadow-md ring-1 ring-blue-100' : 'border-[#DCE6F2] shadow-sm'}`}>
                <div 
                  className="p-6 cursor-pointer hover:bg-gray-50 transition-colors rounded-t-2xl flex flex-col md:flex-row md:items-center justify-between gap-4"
                  onClick={() => togglePhase(phase)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                        stagePriority === 'CRITICAL' ? 'bg-red-100 text-red-800' : 
                        stagePriority === 'HIGH' ? 'bg-orange-100 text-orange-800' : 
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {stagePriority} PRIORITY
                      </span>
                      {isCompleted && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-emerald-100 text-emerald-800">
                          COMPLETED
                        </span>
                      )}
                    </div>
                    <h3 className={`text-xl font-bold ${isCompleted ? 'text-gray-500 line-through' : 'text-[#0B1F3A]'}`}>
                      {stageTitle}
                    </h3>
                    {stageDesc && <p className="text-sm text-gray-600 mt-2 max-w-2xl leading-relaxed">{stageDesc}</p>}
                  </div>

                  <div className="shrink-0 w-full md:w-48">
                    <div className="flex items-center justify-between text-xs font-bold text-gray-500 mb-1">
                      <span>Progress</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${isCompleted ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progressPercent}%` }} />
                    </div>
                    <div className="mt-3 text-right">
                      <span className="text-xs font-semibold text-blue-600 hover:underline">
                        {isExpanded ? 'Hide Steps' : 'View Steps'} &rarr;
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded Steps Area */}
                {isExpanded && (
                  <div className="border-t border-[#DCE6F2] p-6 bg-gray-50/50 rounded-b-2xl space-y-6">
                    
                    {/* University Requirements Context */}
                    {uniReqs && uniReqs.length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 shadow-sm">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Target Requirements
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {uniReqs.map((req, i) => (
                            <div key={i} className="flex flex-col text-sm bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                              <span className="font-semibold text-[#0B1F3A] truncate" title={req.university}>{req.university}</span>
                              <span className="text-gray-500 text-xs truncate" title={req.program}>{req.program}</span>
                              <span className="font-bold text-blue-700 mt-1">{req.requirement}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Step Cards */}
                    <div className="space-y-3">
                      {Object.values(phaseTasks.reduce((acc, task) => {
                        const key = task.title.trim().toLowerCase();
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(task);
                        return acc;
                      }, {} as Record<string, RoadmapTask[]>)).map((taskGroup, stepIndex) => {
                        const primaryTask = taskGroup[0];
                        const isMulti = taskGroup.length > 1;
                        
                        const allCompleted = taskGroup.every(t => t.status === 'completed');
                        const anyInProgress = taskGroup.some(t => t.status === 'in_progress');
                        const groupStatus = allCompleted ? 'completed' : anyInProgress ? 'in_progress' : 'not_started';

                        let stepDesc = primaryTask.description;
                        try {
                          if (stepDesc && stepDesc.startsWith("{")) {
                            const parsed = JSON.parse(stepDesc);
                            if (parsed.is_rich_format) stepDesc = parsed.step_description;
                          }
                        } catch {}

                        const subContexts = isMulti 
                          ? Array.from(new Set(taskGroup.map(t => {
                              try {
                                if (t.description && t.description.startsWith("{")) {
                                  const parsed = JSON.parse(t.description);
                                  if (parsed.is_rich_format && parsed.context) return parsed.context;
                                }
                              } catch {}
                              return t.target_outcome;
                            }).filter(Boolean)))
                          : [];

                        return (
                          <div key={primaryTask.id} className={`border rounded-xl p-4 transition-colors ${groupStatus === 'completed' ? 'bg-gray-50 border-gray-200' : groupStatus === 'in_progress' ? 'bg-white border-blue-300 ring-1 ring-blue-100' : 'bg-white border-gray-200 hover:border-blue-300'}`}>
                            <div className="flex items-start gap-4">
                              <button 
                                disabled={isUpdating}
                                onClick={() => toggleStatus(primaryTask.id, groupStatus)}
                                className="mt-0.5 shrink-0 transition-transform active:scale-95"
                                title={`Change status (Current: ${groupStatus})`}
                              >
                                {groupStatus === 'completed' ? (
                                  <svg className="w-7 h-7 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                ) : groupStatus === 'in_progress' ? (
                                  <svg className="w-7 h-7 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                                ) : (
                                  <div className="w-7 h-7 rounded-full border-2 border-gray-300 bg-gray-50 hover:border-blue-400" />
                                )}
                              </button>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Step {(stepIndex + 1).toString().padStart(2, '0')}</span>
                                  {isMulti && <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{taskGroup.length} Actions Grouped</span>}
                                  {groupStatus === 'in_progress' && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded ml-auto">IN PROGRESS</span>}
                                </div>
                                <h4 className={`text-base font-bold ${groupStatus === 'completed' ? 'line-through text-gray-500' : 'text-[#0B1F3A]'}`}>
                                  {primaryTask.title}
                                </h4>
                                {stepDesc && (
                                  <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{stepDesc}</p>
                                )}

                                {isMulti && subContexts.length > 0 && (
                                  <div className="mt-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Applies to:</p>
                                    <ul className="list-disc pl-4 space-y-1">
                                      {subContexts.map((ctx: string, i: number) => (
                                        <li key={i} className="text-xs font-medium text-gray-600">{ctx}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {(primaryTask.estimated_duration || (!isMulti && primaryTask.target_outcome)) && (
                                  <div className="mt-3 flex flex-wrap gap-3">
                                    {primaryTask.estimated_duration && (
                                      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-md">
                                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        {primaryTask.estimated_duration}
                                      </div>
                                    )}
                                    {!isMulti && primaryTask.target_outcome && (
                                      <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
                                        <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        Target: {primaryTask.target_outcome}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
