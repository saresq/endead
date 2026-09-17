# Zombie Movement Specification

## Purpose

Split a zombie group across every equally short route to its target, evenly and per zombie type, instead of marching the whole group down the first route found.

## Requirements

### Requirement: A zombie group splits between equally short routes
When more than one first step leads equally quickly to the group's target, the group SHALL split across those steps, distributing zombies of each type evenly, rather than sending the whole group down the first route found.

#### Scenario: Two equally short routes
- **WHEN** four Walkers in one zone have two equally short routes to their target
- **THEN** two Walkers take each route

#### Scenario: Split is per type
- **WHEN** a zone holds two Walkers and two Runners with two equally short routes
- **THEN** each route receives one Walker and one Runner

#### Scenario: One shortest route
- **WHEN** only one first step is shortest
- **THEN** the whole group takes it
