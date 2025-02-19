'use client';
import { ChevronDownIcon } from '@radix-ui/react-icons';
import {
  ColumnFiltersState,
  Row,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import * as React from 'react';

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
import { exportJob } from '@/utils/exportUtil';
import cronParser from 'cron-parser';
import { format, parseISO } from 'date-fns';
import { useToast } from './hooks/use-toast';
import { Job, JobStatus } from '@/utils/types';
import { useFetchJobsQuery } from '@/api/queries';
import { useDeleteAllJobsMutation, useRetryJobMutation } from '@/api/mutations';
import { useQueryClient } from '@tanstack/react-query';
import { FETCH_JOBS_QUERY } from '@/constants/queryKeys';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
//url   pincode  status type repeatInterval nextRunTime completedAt failedAt failReason

export function DataTable() {
  const { toast } = useToast();
  const retryJobMutation = useRetryJobMutation();
  const queryClient = useQueryClient();
  const onExportClick = (row: Row<Job>) => {
    const jobId = row?.original?.jobId;
    exportJob(jobId, toast);
  };
  const columns = [
    {
      accessorKey: 'url',
      header: 'URL',
      cell: ({ row }: { row: Row<Job> }) => <div>{row.getValue('url')}</div>
    },
    {
      accessorKey: 'pincode',
      header: 'Pincode',
      cell: ({ row }: { row: Row<Job> }) => (
        <div className="capitalize">{row.getValue('pincode')}</div>
      )
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }: { row: Row<Job> }) => (
        <div className="capitalize">{row.getValue('status')}</div>
      )
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }: { row: Row<Job> }) => (
        <div className="capitalize">{row.getValue('type')}</div>
      )
    },
    {
      accessorKey: 'download',
      header: 'Download',
      cell: ({ row }: { row: Row<Job> }) => {
        const { progress, status, lastRunStatus, type } = row.original;

        // Determine if the download button should be disabled
        const isDownloadDisabled =
          type === 'recurring'
            ? lastRunStatus !== 'completed' // Only care about lastRunStatus for recurring jobs
            : progress !== 100 && status !== 'completed'; // Apply other conditions for non-recurring jobs

        return (
          <Button
            onClick={() => onExportClick(row)}
            disabled={isDownloadDisabled}
          >
            Download
          </Button>
        );
      }
    },

    {
      accessorKey: 'retry',
      header: 'Reset & Auto-Retry',
      cell: ({ row }: { row: Row<Job> }) => {
        const { status, lastRunStatus, type } = row.original;

        const failCount = row.original.failCount || 0;
        if ((status === 'failed' && failCount >= 3) || status === 'queued') {
          return (
            <Button
              onClick={() => retryJobMutation.mutate(row.original.jobId)}
              disabled={
                type === 'recurring'
                  ? status === 'queued' && lastRunStatus === 'completed'
                  : status !== 'failed'
                // (status === 'queued' && lastRunStatus === 'completed') ||
                // status !== 'failed' ||
                // failCount < 3
              }
            >
              Reset
            </Button>
          );
        }
        return null; // Only show button if conditions met
      }
    },
    {
      accessorKey: 'repeatInterval',
      header: 'Repeat Interval',
      cell: ({ row }: { row: Row<Job> }) => {
        const interval = row.getValue('repeatInterval') as string;
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
      cell: ({ row }: { row: Row<Job> }) => {
        const nextRunAt = row.getValue('nextRunAt');
        // Check if nextRunTime is valid
        if (nextRunAt) {
          const nextRunDate = parseISO(nextRunAt as string);
          const formattedDate = format(nextRunDate, 'MMMM dd, yyyy HH:mm:ss');
          return <div className="capitalize">{formattedDate}</div>;
        }
        // If there is no nextRunTime value, return a fallback message
        return <div className="capitalize">Not Scheduled</div>;
      }
    },
    {
      accessorKey: 'lastFinishedAt',
      header: 'Last Finished At',
      cell: ({ row }: { row: Row<Job> }) => {
        const completedAtValue = row.getValue('lastFinishedAt');

        // Check if completedAtValue is valid
        if (completedAtValue) {
          const completedAtDate = parseISO(completedAtValue as string);
          const formattedDate = format(
            completedAtDate,
            'MMMM dd, yyyy HH:mm:ss'
          );
          return <div className="capitalize">{formattedDate}</div>;
        }

        // If there is no completedAt value, return a fallback message
        return <div className="capitalize"></div>;
      }
    },
    {
      accessorKey: 'failCount',
      header: 'Fail Count',
      cell: ({ row }: { row: Row<Job> }) => {
        let failCount = row.original.failCount || 0;
        if (
          row.original.type === 'recurring' &&
          row.original.lastRunStatus == 'completed'
        ) {
          failCount = 0;
        }
        return <div className="capitalize">{failCount}</div>;
      }
    },
    {
      accessorKey: 'failedAt',
      header: 'Failed At',
      cell: ({ row }: { row: Row<Job> }) => {
        const failedAt = new Date(row.getValue('failedAt'));
        if (
          row.original.type === 'recurring' &&
          row.original.lastRunStatus == 'completed'
        ) {
          return <div className="capitalize"></div>;
        }
        <div className="capitalize">{failedAt.toLocaleString()}</div>;
      }
    },
    {
      accessorKey: 'failReason',
      header: 'Fail Reason',
      cell: ({ row }: { row: Row<Job> }) => {
        if (
          row.original.type === 'recurring' &&
          row.original.lastRunStatus == 'completed'
        ) {
          return <div className="capitalize"></div>;
        }
        if (row.getValue('status') !== 'completed') {
          return <div className="capitalize">{row.getValue('failReason')}</div>;
        }
      }
    }
  ];
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  const { data: Jobs } = useFetchJobsQuery();
  const deleteAllJobsMutation = useDeleteAllJobsMutation();
  const table = useReactTable({
    data: Jobs || [],
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
        <div className="ml-auto ">
          <Button
            variant="outline"
            className="mr-5"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: FETCH_JOBS_QUERY });
            }}
          >
            Refresh
          </Button>
          {/* // delete all jobs button */}
          {/* <button
            variant="destructive"
            classname="mr-5"
            onclick={() => {
              deletealljobsmutation.mutate();
            }}
          >
            delete all jobs
          </button> */}
          {table.getFilteredRowModel().rows.length > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive" className="mr-5">
                  Delete All Jobs
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete All Jobs</DialogTitle>
                </DialogHeader>
                <DialogDescription asChild>
                  <div className="flex flex-col gap-2 ">
                    <div>Are you sure you want to delete all jobs?</div>
                    <div className="flex w-full gap-4">
                      <DialogClose asChild>
                        <Button
                          variant="destructive"
                          onClick={async () => {
                            deleteAllJobsMutation.mutate();
                            queryClient.invalidateQueries({
                              queryKey: FETCH_JOBS_QUERY
                            });
                            await queryClient.resetQueries({
                              queryKey: [
                                'progress',
                                localStorage.getItem('jobId')
                              ]
                            });
                            localStorage.removeItem('jobId');
                          }}
                        >
                          Yes I'm sure
                        </Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button>I've changed my mind</Button>
                      </DialogClose>
                    </div>
                  </div>
                </DialogDescription>
              </DialogContent>
            </Dialog>
          )}
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
