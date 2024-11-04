'use client';

import * as React from 'react';
import { ChevronDownIcon } from '@radix-ui/react-icons';
import {
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { apiPrefix, client } from '@/lib/client';
import cronParser from 'cron-parser';
import { format, parseISO } from 'date-fns';

const data: Job[] = [
  {
    id: 'm5gr84i9',
    url: 'https://www.cowin.gov.in',
    pincode: '110001',
    status: 'queued',
    type: 'immediate',
    repeatInterval: '',
    nextRunAt: '',
    completedAt: '',
    failedAt: '',
    failReason: ''
  }
];

//url   pincode  status type repeatInterval nextRunTime completedAt failedAt failReason
export type Job = {
  id: string;
  url: string;
  pincode: string;
  status: 'queued' | 'running' | 'success' | 'failed';
  type: 'immediate' | 'scheduled' | 'recurring';
  repeatInterval: string;
  nextRunAt: string;
  completedAt: string;
  failedAt: string;
  failReason: string;
};
const handleExport = (row) => {
  fetch(`${apiPrefix}/download/${row?.original?.jobId}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}` || ''
    }
  }).then((response) => {
    response.blob().then((blob) => {
      const fileURL = window.URL.createObjectURL(blob);
      // Setting various property values
      const alink = document.createElement('a');
      alink.href = fileURL;
      alink.download = 'data.json';
      alink.click();
    });
  });
};
//url   pincode  status type repeatInterval nextRunTime completedAt failedAt failReason
export const columns = [
  {
    accessorKey: 'url',
    header: 'URL',
    cell: ({ row }) => <div>{row.getValue('url')}</div>
  },
  {
    accessorKey: 'pincode',
    header: 'Pincode',
    cell: ({ row }) => (
      <div className="capitalize">{row.getValue('pincode')}</div>
    )
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <div className="capitalize">{row.getValue('status')}</div>
    )
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => <div className="capitalize">{row.getValue('type')}</div>
  },
  {
    accessorKey: 'download',
    header: 'Download',
    cell: ({ row }) => (
      // check if status is completed first
      <Button
        onClick={() => handleExport(row)}
        disabled={row.original.status !== 'completed'}
      >
        Download
      </Button>
    )
  },
  {
    accessorKey: 'repeatInterval',
    header: 'Repeat Interval',
    cell: ({ row }) => {
      const interval = row.getValue('repeatInterval');
      // Convert the repeatInterval to a human-readable format
      try {
        const intervalDetails = cronParser.parseExpression(interval);
        return (
          <div className="capitalize">
            {intervalDetails.next().toString()}{' '}
            {/* Display the next run time */}
          </div>
        );
      } catch (error) {
        return <div className="capitalize"></div>;
      }
    }
  },
  {
    accessorKey: 'nextRunAt',
    header: 'Next Run At',
    cell: ({ row }) => {
      const nextRunAt = row.getValue('nextRunAt');
      // Check if nextRunTime is valid
      if (nextRunAt) {
        const nextRunDate = parseISO(nextRunAt);
        const formattedDate = format(nextRunDate, 'MMMM dd, yyyy HH:mm:ss');
        return <div className="capitalize">{formattedDate}</div>;
      }
      // If there is no nextRunTime value, return a fallback message
      return <div className="capitalize">Not Scheduled</div>;
    }
  },
  {
    accessorKey: 'completedAt',
    header: 'Completed At',
    cell: ({ row }) => {
      const completedAtValue = row.getValue('completedAt');

      // Check if completedAtValue is valid
      if (completedAtValue) {
        const completedAtDate = parseISO(completedAtValue);
        const formattedDate = format(completedAtDate, 'MMMM dd, yyyy HH:mm:ss');
        return <div className="capitalize">{formattedDate}</div>;
      }

      // If there is no completedAt value, return a fallback message
      return <div className="capitalize">Not Completed</div>;
    }
  },
  {
    accessorKey: 'failedAt',
    header: 'Failed At',
    cell: ({ row }) => {
      const failedAt = new Date(row.getValue('failedAt'));
      <div className="capitalize">{failedAt.toLocaleString()}</div>;
    }
  },
  {
    accessorKey: 'failReason',
    header: 'Fail Reason',
    cell: ({ row }) => (
      <div className="capitalize">{row.getValue('failReason')}</div>
    )
  }
];

export function DataTable() {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  const getJobs = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const response = await client.get(`/jobs`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}` || ''
        }
      });
      return response.json();
    }
  });

  const table = useReactTable({
    data: getJobs.data || [],
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection
    }
  });
  return (
    <div className="w-full">
      <div className="flex items-center py-4">
        <Input
          placeholder="Filter jobs..."
          value={(table.getColumn('url')?.getFilterValue() as string) ?? ''}
          onChange={(event) =>
            table.getColumn('url')?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              Columns <ChevronDownIcon className="ml-2 size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="text-muted-foreground flex-1 text-sm">
          {table.getFilteredSelectedRowModel().rows.length} of{' '}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
