# shadcn Tailwind styles

`shadcn-tailwind.css` preserves `dist/tailwind.css` from the npm package
`shadcn@4.17.0`. Its MIT license is included in `shadcn-LICENSE.md`.

The app needs these CSS variants, utilities, and animations, but does not need
the scaffolding CLI in its installed dependencies. Keeping the stylesheet here
removes the CLI's vulnerable glob dependency chain without changing the styles.

When updating these styles, copy the upstream stylesheet and license together,
then run the frontend build. To add components manually, run
`npx shadcn@4.17.0 add <component>` from `frontend`. That temporary CLI still has
the upstream glob advisory; it is not part of the regular install or build.
