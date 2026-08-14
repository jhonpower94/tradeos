import { Fragment, type ReactNode } from 'react';
import Box from '@mui/joy/Box';
import Card from '@mui/joy/Card';
import Sheet from '@mui/joy/Sheet';
import Stack from '@mui/joy/Stack';
import Table from '@mui/joy/Table';
import Typography from '@mui/joy/Typography';
import { EmptyState } from './EmptyState';
import { monoSx } from '../theme/theme';

export type RecordColumn<T> = {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  numeric?: boolean;
  render: (row: T) => ReactNode;
};

export type CardField<T> = {
  label: string;
  render: (row: T) => ReactNode;
  span?: 1 | 2;
};

type Props<T> = {
  rows: T[];
  getRowKey: (row: T) => string;
  columns: RecordColumn<T>[];
  emptyTitle?: string;
  emptyDescription?: string;
  cardTitle: (row: T) => ReactNode;
  cardMeta?: (row: T) => ReactNode;
  cardFields?: CardField<T>[];
  cardActions?: (row: T) => ReactNode;
  expandedContent?: (row: T) => ReactNode | null | undefined;
  cardsOnly?: boolean;
};

export function ResponsiveRecordList<T>({
  rows,
  getRowKey,
  columns,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  cardTitle,
  cardMeta,
  cardFields,
  cardActions,
  expandedContent,
  cardsOnly = false,
}: Props<T>) {
  const fields: CardField<T>[] =
    cardFields ?? columns.map((c) => ({ label: c.header, render: c.render }));

  if (!rows.length) {
    return (
      <Sheet variant="outlined" sx={{ borderRadius: 'md' }}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </Sheet>
    );
  }

  return (
    <>
      <Stack
        spacing={1.25}
        sx={{ display: cardsOnly ? 'flex' : { xs: 'flex', md: 'none' } }}
      >
        {rows.map((row) => {
          const expanded = expandedContent?.(row);
          return (
            <Card key={getRowKey(row)} variant="outlined" sx={{ p: 1.75, boxShadow: 'none' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                <Box sx={{ minWidth: 0 }}>{cardTitle(row)}</Box>
                {cardMeta && (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {cardMeta(row)}
                  </Box>
                )}
              </Box>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 1,
                  mt: 1.5,
                }}
              >
                {fields.map((field) => (
                  <Box key={field.label} sx={{ gridColumn: field.span === 2 ? '1 / -1' : undefined }}>
                    <Typography
                      level="body-xs"
                      sx={{ color: 'text.tertiary', textTransform: 'uppercase', letterSpacing: 0.4 }}
                    >
                      {field.label}
                    </Typography>
                    <Box sx={{ mt: 0.25 }}>{field.render(row)}</Box>
                  </Box>
                ))}
              </Box>
              {(() => {
                const actions = cardActions?.(row);
                if (!actions) return null;
                return (
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ mt: 1.75, flexWrap: 'wrap', '& > *': { flex: '1 1 auto' } }}
                  >
                    {actions}
                  </Stack>
                );
              })()}
              {expanded ? <Box sx={{ mt: 1.75 }}>{expanded}</Box> : null}
            </Card>
          );
        })}
      </Stack>

      {!cardsOnly && (
        <Sheet
          variant="outlined"
          sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto', borderRadius: 'md' }}
        >
          <Table stickyHeader>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} style={{ textAlign: col.align ?? (col.numeric ? 'right' : 'left') }}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expanded = expandedContent?.(row);
                const rowKey = getRowKey(row);
                return (
                  <Fragment key={rowKey}>
                    <tr>
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          style={{
                            textAlign: col.align ?? (col.numeric ? 'right' : 'left'),
                            fontFamily: col.numeric ? 'var(--joy-fontFamily-code)' : undefined,
                          }}
                        >
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                    {expanded ? (
                      <tr>
                        <td colSpan={columns.length} style={{ background: 'var(--joy-palette-background-body)' }}>
                          <Box sx={{ py: 1.5 }}>{expanded}</Box>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        </Sheet>
      )}
    </>
  );
}

export function KeyValueList({
  items,
  emptyTitle = 'Nothing here yet',
}: {
  items: Array<{ key: string; primary: ReactNode; secondary?: ReactNode; trailing: ReactNode }>;
  emptyTitle?: string;
}) {
  if (!items.length) {
    return (
      <Sheet variant="outlined" sx={{ borderRadius: 'md' }}>
        <EmptyState title={emptyTitle} />
      </Sheet>
    );
  }

  return (
    <Sheet variant="outlined" sx={{ borderRadius: 'md', overflow: 'hidden' }}>
      {items.map((item, i) => (
        <Box
          key={item.key}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1.25,
            borderBottom: i === items.length - 1 ? 'none' : '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography level="title-sm" sx={{ ...monoSx }}>
              {item.primary}
            </Typography>
            {item.secondary && (
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                {item.secondary}
              </Typography>
            )}
          </Box>
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>{item.trailing}</Box>
        </Box>
      ))}
    </Sheet>
  );
}
