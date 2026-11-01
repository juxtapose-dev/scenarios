<script lang="ts">
interface Props {
  label: string;
  fixture: { values: string[] };
}
let { label, fixture }: Props = $props();
let count = $state(0);
let fixtureCount = $state(0);
$effect(() => {
  fixtureCount = fixture.values.length;
});
function mutate() {
  fixture.values.push("changed");
  fixtureCount = fixture.values.length;
  count += 1;
}
</script>

<article aria-label={label}>
  <h2>{label}</h2>
  <p>Fixture values: {fixtureCount}</p>
  <p>Local changes: {count}</p>
  <button onclick={mutate}>Change state</button>
</article>
