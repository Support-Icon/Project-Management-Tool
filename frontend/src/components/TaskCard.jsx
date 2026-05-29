import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { Calendar, User, Edit3, Trash2, Flag } from 'lucide-react';

const priorityConfig = {
  high: {
    dot: 'bg-red-500',
    badge: 'text-red-600 bg-red-50',
    border: 'border-l-red-400',
  },
  medium: {
    dot: 'bg-amber-500',
    badge: 'text-amber-600 bg-amber-50',
    border: 'border-l-amber-400',
  },
  low: {
    dot: 'bg-emerald-500',
    badge: 'text-emerald-600 bg-emerald-50',
    border: 'border-l-emerald-400',
  },
};

export default function TaskCard({ task, index, onEdit, onDelete }) {
  const pc = priorityConfig[task.priority] || priorityConfig.medium;

  const isOverdue =
    task.dueDate && new Date(task.dueDate) < new Date() && task.column !== 'done';

  const dueDateStr = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  return (
    <Draggable draggableId={task._id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`bg-white rounded-xl border border-l-4 ${pc.border} border-r-slate-100 border-t-slate-100 border-b-slate-100 p-4 shadow-sm
            ${snapshot.isDragging ? 'shadow-xl rotate-1 scale-105 ring-2 ring-indigo-300' : 'hover:shadow-md'}
            transition-all duration-150 cursor-grab active:cursor-grabbing group`}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="font-semibold text-slate-800 text-sm leading-snug flex-1">{task.title}</p>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
              >
                <Edit3 size={13} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(task._id); }}
                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <p className="text-slate-500 text-xs mb-3 line-clamp-2 leading-relaxed">
              {task.description}
            </p>
          )}

          {/* Tags */}
          {task.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {task.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full font-medium"
                >
                  {tag}
                </span>
              ))}
              {task.tags.length > 3 && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">
                  +{task.tags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {/* Priority */}
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${pc.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
                {task.priority}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Due date */}
              {dueDateStr && (
                <span className={`flex items-center gap-1 text-xs font-medium ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
                  <Calendar size={11} />
                  {dueDateStr}
                </span>
              )}

              {/* Assignee avatar */}
              {task.assignee && (
                <div
                  className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  title={task.assignee.username}
                >
                  {task.assignee.username[0].toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
