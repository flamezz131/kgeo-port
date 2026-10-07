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

interface SpecializationComboboxProps {
  selectedSpecs: string[];
  onChange: (specs: string[]) => void;
  allSpecs: string[];
}

export function SpecializationCombobox({
  selectedSpecs,
  onChange,
  allSpecs,
}: SpecializationComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const toggleSpec = (spec: string) => {
    if (selectedSpecs.includes(spec)) {
      onChange(selectedSpecs.filter((s) => s !== spec));
    } else {
      onChange([...selectedSpecs, spec]);
    }
    setInputValue("");
  };

  const [customInput, setCustomInput] = useState("");

  const handleAddCustom = () => {
    if (customInput.trim() && !selectedSpecs.includes(customInput.trim())) {
      onChange([...selectedSpecs, customInput.trim()]);
    }
    setCustomInput("");
  };

  return (
    <div className="space-y-4">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          type="button"
          role="combobox"
          aria-expanded={open}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-[#DCE6F2] rounded-xl text-sm font-medium text-[#0F172A] hover:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] transition-colors"
        >
          <span>
            {selectedSpecs.length === 0
              ? "Select domain specializations..."
              : `${selectedSpecs.length} specialization${
                  selectedSpecs.length > 1 ? "s" : ""
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
              placeholder="Search specializations..."
              className="border-b border-[#DCE6F2]"
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList className="max-h-64 overflow-y-auto p-1">
              <CommandEmpty className="py-6 text-center text-sm text-[#64748B]">
                No exact specialization found. You can add it below!
              </CommandEmpty>
              <CommandGroup>
                {allSpecs.map((spec) => {
                  const isSelected = selectedSpecs.includes(spec);
                  return (
                    <CommandItem
                      key={spec}
                      value={spec}
                      onSelect={() => toggleSpec(spec)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[#EFF6FF] text-[#1D4ED8] font-semibold"
                          : "hover:bg-gray-100 text-[#0F172A]"
                      }`}
                    >
                      <span>{spec}</span>
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

      {/* Separate input for adding unlisted specializations */}
      <div className="flex items-center gap-2 mt-3 pt-2">
        <input 
          type="text" 
          value={customInput} 
          onChange={e => setCustomInput(e.target.value)} 
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddCustom();
            }
          }}
          placeholder="Type a domain specialization not listed above..." 
          className="flex-1 px-3 py-2.5 border border-[#DCE6F2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] transition-colors"
        />
        <button 
          type="button" 
          onClick={handleAddCustom}
          disabled={!customInput.trim()}
          className="px-5 py-2.5 bg-[#1D4ED8] text-white rounded-xl text-sm font-semibold hover:bg-[#1e40af] disabled:opacity-50 transition-colors shadow-sm"
        >
          Add
        </button>
      </div>

      {selectedSpecs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedSpecs.map((spec) => (
            <Badge
              key={spec}
              variant="outline"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFF6FF] border border-[#1D4ED8] text-[#1D4ED8] font-medium text-sm transition-all hover:bg-[#1D4ED8] hover:text-white group"
            >
              <span>{spec}</span>
              <button
                type="button"
                onClick={() => toggleSpec(spec)}
                className="ml-1 rounded-full text-[#1D4ED8] group-hover:text-white font-bold hover:opacity-75 focus:outline-none"
                aria-label={`Remove ${spec}`}
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
