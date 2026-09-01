import InviteSectionRenderer from './InviteSectionRenderer';

// Top-level schema-driven form primitive: walks schema.sections and renders
// each via InviteSectionRenderer. Deliberately has no card/container
// styling and no save button of its own — both ToranInvites.js (mobile,
// wrapped in its existing formCard) and InviteDesignerDesktop.js (desktop,
// wrapped in its existing form pane) already have their own outer
// container + save affordance; this component's only job is the field
// list itself, so it's the one thing both surfaces can share verbatim
// instead of each hand-duplicating the field JSX (which is exactly what
// this wave's brief asked to eliminate).
export default function InviteSchemaForm({ theme, schema, values, onFieldChange, onPickPhoto, photoUploadingKey }) {
  return (
    <>
      {schema.sections.map((section) => (
        <InviteSectionRenderer
          key={section.key}
          theme={theme}
          section={section}
          values={values}
          onFieldChange={onFieldChange}
          onPickPhoto={onPickPhoto}
          photoUploadingKey={photoUploadingKey}
        />
      ))}
    </>
  );
}
