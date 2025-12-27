import {
  addExpenseToJourneyCache,
  removeExpenseFromJourneyCache,
  addMemberToJourneyCache,
  updateJourneyMembers,
  writeUserBankInfo,
} from "../lib/apolloCache";

describe("apolloCache helpers", () => {
  test("addExpenseToJourneyCache writes fragment and modifies journey", () => {
    const cache: any = {
      identify: jest.fn().mockReturnValue("Journey:1"),
      writeFragment: jest.fn().mockReturnValue({ __ref: "Expense:temp" }),
      modify: jest.fn(),
      refetchQueries: jest.fn(),
    };

    const expense = { id: "e1", description: "d", totalAmount: 10 };
    addExpenseToJourneyCache(cache, "1", expense);

    expect(cache.identify).toHaveBeenCalledWith({
      __typename: "Journey",
      id: "1",
    });
    expect(cache.writeFragment).toHaveBeenCalled();
    expect(cache.modify).toHaveBeenCalled();
  });

  test("removeExpenseFromJourneyCache removes by journey when available", () => {
    const cache: any = {
      identify: jest.fn().mockReturnValue("Journey:1"),
      modify: jest.fn(),
      evict: jest.fn(),
      gc: jest.fn(),
      refetchQueries: jest.fn(),
    };

    removeExpenseFromJourneyCache(cache, "1", "exp1");

    expect(cache.identify).toHaveBeenCalledWith({
      __typename: "Journey",
      id: "1",
    });
    expect(cache.modify).toHaveBeenCalled();
    expect(cache.evict).not.toHaveBeenCalled();
  });

  test("removeExpenseFromJourneyCache evicts expense when journeyId missing", () => {
    const cache: any = {
      identify: jest.fn((obj: any) =>
        obj.__typename === "Expense" ? "Expense:exp1" : null
      ),
      evict: jest.fn(),
      gc: jest.fn(),
      refetchQueries: jest.fn(),
    };

    removeExpenseFromJourneyCache(cache, undefined, "exp1");

    expect(cache.identify).toHaveBeenCalledWith({
      __typename: "Expense",
      id: "exp1",
    });
    expect(cache.evict).toHaveBeenCalled();
    expect(cache.gc).toHaveBeenCalled();
  });

  test("addMemberToJourneyCache writes user fragment and modifies members", () => {
    const cache: any = {
      identify: jest.fn().mockReturnValue("Journey:1"),
      writeFragment: jest.fn().mockReturnValue({ __ref: "User:2" }),
      modify: jest.fn(),
      refetchQueries: jest.fn(),
    };

    const user = { id: "2", name: "Bob" };
    addMemberToJourneyCache(cache, "1", user);

    expect(cache.identify).toHaveBeenCalledWith({
      __typename: "Journey",
      id: "1",
    });
    expect(cache.writeFragment).toHaveBeenCalled();
    expect(cache.modify).toHaveBeenCalled();
  });

  test("updateJourneyMembers writes member fragments and modifies journey", () => {
    const cache: any = {
      identify: jest.fn().mockReturnValue("Journey:1"),
      writeFragment: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ __ref: `User:${data.id}` })),
      modify: jest.fn(),
      refetchQueries: jest.fn(),
    };

    const members = [
      { id: "1", name: "A" },
      { id: "2", name: "B" },
    ];
    const pending = [{ id: "3", name: "C" }];

    updateJourneyMembers(cache, "1", members, pending);

    expect(cache.identify).toHaveBeenCalledWith({
      __typename: "Journey",
      id: "1",
    });
    expect(cache.writeFragment).toHaveBeenCalledTimes(3);
    expect(cache.modify).toHaveBeenCalled();
  });

  test("writeUserBankInfo writes fragment for user", () => {
    const cache: any = {
      identify: jest.fn().mockReturnValue("User:5"),
      writeFragment: jest.fn(),
      refetchQueries: jest.fn(),
    };

    const user = {
      id: "5",
      bankInfo: {
        bankInformation: { name: "B", number: "123", userName: "u" },
      },
    };
    writeUserBankInfo(cache, user);

    expect(cache.identify).toHaveBeenCalledWith({
      __typename: "User",
      id: user.id,
    });
    expect(cache.writeFragment).toHaveBeenCalled();
  });
});
