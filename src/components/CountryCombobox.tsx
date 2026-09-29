"use client";

import React, { useState, useMemo } from "react";
import { getAllCountries } from "@/lib/countries";
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

interface CountryComboboxProps {
  selectedCountries: string[];
  onChange: (countries: string[]) => void;
}

export function CountryCombobox({
  selectedCountries,
  onChange,
}: CountryComboboxProps) {
  const [open, setOpen] = useState(false);
  const allCountries = useMemo(() => getAllCountries(), []);

  const toggleCountry = (country: string) => {
    if (selectedCountries.includes(country)) {
      onChange(selectedCountries.filter((c) => c !== country));
    } else {
      onChange([...selectedCountries, country]);
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
            {selectedCountries.length === 0
              ? "Select preferred study destinations..."
              : `${selectedCountries.length} destination${
                  selectedCountries.length > 1 ? "s" : ""
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
              placeholder="Search countries..."
              className="border-b border-[#DCE6F2]"
            />
            <CommandList className="max-h-64 overflow-y-auto p-1">
              <CommandEmpty className="py-6 text-center text-sm text-[#64748B]">
                No country found.
              </CommandEmpty>
              <CommandGroup>
                {allCountries.map((country) => {
                  const isSelected = selectedCountries.includes(country);
                  return (
                    <CommandItem
                      key={country}
                      value={country}
                      onSelect={() => toggleCountry(country)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[#EFF6FF] text-[#1D4ED8] font-semibold"
                          : "hover:bg-gray-100 text-[#0F172A]"
                      }`}
                    >
                      <span>{country}</span>
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

      {selectedCountries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCountries.map((country) => (
            <Badge
              key={country}
              variant="outline"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFF6FF] border border-[#1D4ED8] text-[#1D4ED8] font-medium text-sm transition-all hover:bg-[#1D4ED8] hover:text-white group"
            >
              <span>{country}</span>
              <button
                type="button"
                onClick={() => toggleCountry(country)}
                className="ml-1 rounded-full text-[#1D4ED8] group-hover:text-white font-bold hover:opacity-75 focus:outline-none"
                aria-label={`Remove ${country}`}
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
