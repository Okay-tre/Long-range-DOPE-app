<!-- TODO: Define specific guidelines for ballistics calculator project -->
<!-- TODO: Add accessibility requirements -->
<!-- TODO: Define code quality standards -->
<!-- TODO: Add performance optimization guidelines -->

# Long Range DOPE Calculator Project Guidelines

<!-- TODO: Add project-specific design system rules -->
<!-- TODO: Define component architecture patterns -->
<!-- TODO: Add testing requirements -->

## General Guidelines

<!-- TODO: Define coding standards for TypeScript -->
<!-- TODO: Add documentation requirements -->
<!-- TODO: Define git workflow and commit message standards -->

* Use TypeScript for type safety and better developer experience
* Implement responsive design for mobile and desktop
* Follow React best practices with functional components and hooks
* Use shadcn/ui components consistently across the application
* Maintain clean, readable code with proper commenting

## Long Range DOPE Calculator Specific Guidelines

<!-- TODO: Add scientific accuracy requirements -->
<!-- TODO: Define input validation rules -->
<!-- TODO: Add unit conversion standards -->

* Ensure mathematical accuracy in all ballistics calculations
* Provide clear labels and tooltips for technical terms
* Validate all user inputs to prevent calculation errors
* Display results with appropriate precision (3 decimal places for time, 2 for distance)
* Use consistent units (metric system as primary, with imperial conversion)
* Air density must always be calculated from atmospheric conditions (temperature, pressure, humidity) rather than manual input
* Use standard atmospheric conditions (15°C, 101325 Pa, 0% RH) when weather data is unavailable
* Display calculated air density as read-only information with source conditions

## Design System Guidelines

<!-- TODO: Define color scheme for ballistics-specific elements -->
<!-- TODO: Add typography hierarchy for technical content -->
<!-- TODO: Define spacing standards for complex forms -->

* Use base font-size of 14px as defined in globals.css
* Maintain consistent spacing using Tailwind's spacing scale
* Use card components to group related inputs and results
* Implement collapsible sections for advanced features
* Ensure proper contrast ratios for accessibility

## Performance Guidelines

<!-- TODO: Add performance benchmarks -->
<!-- TODO: Define caching strategies -->
<!-- TODO: Add bundle size limits -->

* Optimize re-calculations using useCallback and useMemo
* Implement debouncing for real-time input updates
* Cache weather data to reduce API calls
* Lazy load non-essential components

## Testing Guidelines

<!-- TODO: Add unit testing requirements -->
<!-- TODO: Define integration testing standards -->
<!-- TODO: Add accuracy validation requirements -->

* Test all mathematical functions with known ballistics data
* Validate input handling and edge cases
* Test responsive design across device sizes
* Ensure accessibility compliance (WCAG 2.1 AA)

**Add your own guidelines here**
<!--

System Guidelines

Use this file to provide the AI with rules and guidelines you want it to follow.
This template outlines a few examples of things you can add. You can add your own sections and format it to suit your needs

TIP: More context isn't always better. It can confuse the LLM. Try and add the most important rules you need

# General guidelines

Any general rules you want the AI to follow.
For example:

* Only use absolute positioning when necessary. Opt for responsive and well structured layouts that use flexbox and grid by default
* Refactor code as you go to keep code clean
* Keep file sizes small and put helper functions and components in their own files.

--------------

# Design system guidelines
Rules for how the AI should make generations look like your company's design system

Additionally, if you select a design system to use in the prompt box, you can reference
your design system's components, tokens, variables and components.
For example:

* Use a base font-size of 14px
* Date formats should always be in the format "Jun 10"
* The bottom toolbar should only ever have a maximum of 4 items
* Never use the floating action button with the bottom toolbar
* Chips should always come in sets of 3 or more
* Don't use a dropdown if there are 2 or fewer options

You can also create sub sections and add more specific details
For example:


## Button
The Button component is a fundamental interactive element in our design system, designed to trigger actions or navigate
users through the application. It provides visual feedback and clear affordances to enhance user experience.

### Usage
Buttons should be used for important actions that users need to take, such as form submissions, confirming choices,
or initiating processes. They communicate interactivity and should have clear, action-oriented labels.

### Variants
* Primary Button
  * Purpose : Used for the main action in a section or page
  * Visual Style : Bold, filled with the primary brand color
  * Usage : One primary button per section to guide users toward the most important action
* Secondary Button
  * Purpose : Used for alternative or supporting actions
  * Visual Style : Outlined with the primary color, transparent background
  * Usage : Can appear alongside a primary button for less important actions
* Tertiary Button
  * Purpose : Used for the least important actions
  * Visual Style : Text-only with no border, using primary color
  * Usage : For actions that should be available but not emphasized
-->
