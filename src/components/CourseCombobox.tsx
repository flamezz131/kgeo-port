"use client";

import React, { useState } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";

interface CourseComboboxProps {
  selectedCourses: string[];
  onChange: (courses: string[]) => void;
  allCourses: string[];
}

export function CourseCombobox({
  selectedCourses,
  onChange,
  allCourses,
}: CourseComboboxProps) {
  const [open, setOpen] = useState(false);

  const toggleCourse = (course: string) => {
    if (selectedCourses.includes(course)) {
      onChange(selectedCourses.filter((c) => c !== course));
    } else {
      onChange([...selectedCourses, course]);
    }
  };

  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          type="button"
          role="combobox"
          aria-expanded={open}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-[#DCE6F2] rounded-xl text-sm font-medium text-[#0F172A] hover:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] transition-colors"
        >
          <span>
            {selectedCourses.length === 0
              ? "Select preferred courses..."
              : `${selectedCourses.length} course${
                  selectedCourses.length > 1 ? "s" : ""
                } selected`}
          </span>
          <span className="text-[#64748B] ml-2">&#9662;</span>
        </PopoverTrigger>
        <PopoverContent
          className="w-[350px] max-w-[90vw] p-0 border border-[#DCE6F2] rounded-xl bg-white shadow-lg"
          align="start"
        >
          <Command className="w-full">
            <CommandInput
              placeholder="Search courses..."
              className="border-b border-[#DCE6F2]"
            />
            <CommandList className="max-h-64 overflow-y-auto p-1">
              <CommandEmpty className="py-6 text-center text-sm text-[#64748B]">
                No course found.
              </CommandEmpty>
              <CommandGroup>
                {allCourses.map((course) => {
                  const isSelected = selectedCourses.includes(course);
                  return (
                    <CommandItem
                      key={course}
                      value={course}
                      onSelect={() => toggleCourse(course)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[#EFF6FF] text-[#1D4ED8] font-semibold"
                          : "hover:bg-gray-100 text-[#0F172A]"
                      }`}
                    >
                      <span>{course}</span>
                      {isSelected && (
                        <span className="text-[#1D4ED8] font-bold">&#10003;</span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedCourses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCourses.map((course) => (
            <Badge
              key={course}
              variant="outline"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFF6FF] border border-[#1D4ED8] text-[#1D4ED8] font-medium text-sm transition-all hover:bg-[#1D4ED8] hover:text-white group"
            >
              <span>{course}</span>
              <button
                type="button"
                onClick={() => toggleCourse(course)}
                className="ml-1 rounded-full text-[#1D4ED8] group-hover:text-white font-bold hover:opacity-75 focus:outline-none"
                aria-label={`Remove ${course}`}
              >
                &times;
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
